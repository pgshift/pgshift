import type {
  WorkflowAdapter,
  WorkflowDefinition,
  WorkflowRunStatus,
} from '@pgshift/core'
import { validateDag } from './dag'
import type { PgPool } from './pool'
import { ensureSchema } from './schema'
import { startWorkflowWorker } from './worker'

export interface WorkflowStepConfig {
  /** Name of the handler function registered via .handlers() */
  handler: string
  /** Max retry attempts before the step fails permanently. Defaults to 3. */
  retries?: number
  /** Name of the compensation handler to run if the workflow fails after this step completes */
  compensate?: string
}

export interface WorkflowContext {
  runId: string
  step: string
  input: Record<string, unknown>
  attempt: number
  previousSteps: Record<string, unknown>
}

export function createPostgresWorkflowAdapter(pool: PgPool): WorkflowAdapter {
  const stoppers = new Map<string, () => Promise<void>>()
  const definitionCache = new Map<string, WorkflowDefinition>()
  const handlerCache = new Map<
    string,
    Record<string, (ctx: WorkflowContext) => Promise<unknown>>
  >()

  return {
    name: 'postgres',

    // -------------------------------------------------------------------------
    // define — stores workflow config and DAG in the database
    // -------------------------------------------------------------------------
    async define(name: string, definition: WorkflowDefinition): Promise<void> {
      await ensureSchema(pool)
      validateDag(definition.dag)

      await pool.query(
        `INSERT INTO _pgshift_workflow_definitions (name, steps, dag, updated_at)
         VALUES ($1, $2::jsonb, $3::jsonb, NOW())
         ON CONFLICT (name) DO UPDATE
           SET steps = EXCLUDED.steps,
               dag   = EXCLUDED.dag,
               updated_at = NOW()`,
        [
          name,
          JSON.stringify(definition.steps),
          JSON.stringify(definition.dag),
        ],
      )

      definitionCache.set(name, definition)
    },

    // -------------------------------------------------------------------------
    // handlers — registers step handler functions
    // -------------------------------------------------------------------------
    async handlers(
      name: string,
      handlers: Record<string, (ctx: WorkflowContext) => Promise<unknown>>,
    ): Promise<void> {
      handlerCache.set(name, handlers)
    },

    // -------------------------------------------------------------------------
    // run — creates a new workflow run and initializes step rows
    // -------------------------------------------------------------------------
    async run(
      name: string,
      input: Record<string, unknown> = {},
    ): Promise<string> {
      await ensureSchema(pool)

      const defRow = await pool.query<{
        steps: Record<string, WorkflowStepConfig>
        dag: Record<string, string[]>
      }>(
        `SELECT steps, dag FROM _pgshift_workflow_definitions WHERE name = $1`,
        [name],
      )

      const definition = defRow[0]

      if (!definition) {
        throw new Error(
          `[PgShift] Workflow "${name}" has not been defined. Call db.workflow("${name}").define(...) first.`,
        )
      }

      const { steps } = definition

      const runRows = await pool.query<{ id: string }>(
        `INSERT INTO _pgshift_workflow_runs (workflow, input)
         VALUES ($1, $2::jsonb)
         RETURNING id`,
        [name, JSON.stringify(input)],
      )

      const runRow = runRows[0]
      if (!runRow) throw new Error('[PgShift] Failed to create workflow run.')
      const runId = runRow.id

      // Create a pending step row for each step in the definition
      for (const [step, cfg] of Object.entries(steps)) {
        await pool.query(
          `INSERT INTO _pgshift_workflow_steps (run_id, workflow, step, max_retries)
           VALUES ($1, $2, $3, $4)`,
          [runId, name, step, (cfg as WorkflowStepConfig).retries ?? 3],
        )
      }

      return runId
    },

    // -------------------------------------------------------------------------
    // status — returns current status of a run and all its steps
    // -------------------------------------------------------------------------
    async status(runId: string): Promise<WorkflowRunStatus> {
      const runRows = await pool.query<{
        id: string
        workflow: string
        status: string
        input: Record<string, unknown>
        started_at: Date
        finished_at: Date | null
      }>(
        `SELECT id, workflow, status, input, started_at, finished_at
         FROM _pgshift_workflow_runs WHERE id = $1`,
        [runId],
      )

      const run = runRows[0]
      if (!run) {
        throw new Error(`[PgShift] Workflow run "${runId}" not found.`)
      }

      const stepRows = await pool.query<{
        step: string
        status: string
        attempts: number
        output: Record<string, unknown> | null
        error: string | null
        started_at: Date | null
        completed_at: Date | null
      }>(
        `SELECT step, status, attempts, output, error, started_at, completed_at
         FROM _pgshift_workflow_steps WHERE run_id = $1
         ORDER BY step`,
        [runId],
      )

      const steps: WorkflowRunStatus['steps'] = {}
      for (const row of stepRows) {
        steps[row.step] = {
          status: row.status,
          attempts: row.attempts,
          output: row.output ?? undefined,
          error: row.error ?? undefined,
          startedAt: row.started_at ?? undefined,
          completedAt: row.completed_at ?? undefined,
        }
      }

      return {
        runId: run.id,
        workflow: run.workflow,
        status: run.status,
        input: run.input,
        startedAt: run.started_at,
        finishedAt: run.finished_at ?? undefined,
        steps,
      }
    },

    // -------------------------------------------------------------------------
    // work — starts the polling worker for a workflow
    // -------------------------------------------------------------------------
    async work(name: string): Promise<void> {
      const definition = definitionCache.get(name)
      const handlers = handlerCache.get(name)

      if (!definition) {
        throw new Error(
          `[PgShift] Cannot start worker: workflow "${name}" has not been defined in this process. ` +
            `Call db.workflow("${name}").define(...) and .handlers(...) before .work().`,
        )
      }

      if (!handlers) {
        throw new Error(
          `[PgShift] Cannot start worker: no handlers registered for workflow "${name}". ` +
            `Call db.workflow("${name}").handlers({ ... }) before .work().`,
        )
      }

      const stop = startWorkflowWorker(
        pool,
        name,
        definition.dag,
        definition.steps as Record<string, WorkflowStepConfig>,
        handlers,
      )
      stoppers.set(name, stop)
    },

    // -------------------------------------------------------------------------
    // teardown
    // -------------------------------------------------------------------------
    async teardown(): Promise<void> {
      await Promise.all([...stoppers.values()].map((stop) => stop()))
      stoppers.clear()
      await pool.end()
    },
  }
}

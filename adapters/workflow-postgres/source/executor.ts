import type { WorkflowContext, WorkflowStepConfig } from './adapter'
import { compensateRun } from './compensator'
import { type DagConfig, readySteps } from './dag'
import type { PgPool } from './pool'

const WORKER_ID = `workflow_${process.pid}_${Date.now()}`
const STALE_TIMEOUT_MS = 30_000

/**
 * Advances a single workflow run by one tick:
 * 1. Load current step statuses for the run
 * 2. Determine which steps are ready (dependencies completed)
 * 3. Dispatch ready steps to workers via SKIP LOCKED
 * 4. Check if run is complete or failed
 */
export async function advanceRun(
  pool: PgPool,
  runId: string,
  workflowName: string,
  dag: DagConfig,
  stepsConfig: Record<string, WorkflowStepConfig>,
  handlers: Record<string, (ctx: WorkflowContext) => Promise<unknown>>,
  input: Record<string, unknown>,
): Promise<void> {
  // Load current step statuses
  const stepRows = await pool.query<{
    step: string
    status: string
    output: Record<string, unknown> | null
  }>(
    `SELECT step, status, output FROM _pgshift_workflow_steps WHERE run_id = $1`,
    [runId],
  )

  const stepStatuses: Record<string, string> = {}
  const previousOutputs: Record<string, unknown> = {}

  for (const row of stepRows) {
    stepStatuses[row.step] = row.status
    if (row.output) previousOutputs[row.step] = row.output
  }

  // Check if any step is permanently failed (exhausted retries)
  const failedStep = stepRows.find((r) => r.status === 'failed')

  if (failedStep) {
    await compensateRun(
      pool,
      runId,
      workflowName,
      dag,
      stepsConfig,
      handlers,
      input,
      previousOutputs,
    )
    return
  }

  // Check if all steps are completed
  const allCompleted = Object.values(stepStatuses).every(
    (s) => s === 'completed' || s === 'skipped',
  )

  if (allCompleted) {
    await pool.query(
      `UPDATE _pgshift_workflow_runs
       SET status = 'completed', finished_at = NOW()
       WHERE id = $1`,
      [runId],
    )
    return
  }

  // Dispatch ready steps
  const ready = readySteps(dag, stepStatuses)

  for (const step of ready) {
    await dispatchStep(
      pool,
      runId,
      workflowName,
      step,
      stepsConfig[step]!,
      handlers,
      input,
      previousOutputs,
    )
  }
}

async function dispatchStep(
  pool: PgPool,
  runId: string,
  workflowName: string,
  step: string,
  config: WorkflowStepConfig,
  handlers: Record<string, (ctx: WorkflowContext) => Promise<unknown>>,
  input: Record<string, unknown>,
  previousOutputs: Record<string, unknown>,
): Promise<void> {
  // Claim the step via SKIP LOCKED to prevent duplicate execution
  const claimed = await pool.transaction(async (client) => {
    const result = await client.query<{ id: string; attempts: number }>(
      `SELECT id, attempts FROM _pgshift_workflow_steps
       WHERE run_id = $1 AND step = $2 AND status = 'pending'
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
      [runId, step],
    )

    if (result.rows.length === 0) return null

    await client.query(
      `UPDATE _pgshift_workflow_steps
       SET status = 'running', locked_at = NOW(), locked_by = $1,
           started_at = NOW(), attempts = attempts + 1
       WHERE id = $2`,
      [WORKER_ID, result.rows[0]!.id],
    )

    return result.rows[0]!
  })

  if (!claimed) return

  const handler = handlers[config.handler]
  if (!handler) {
    await pool.query(
      `UPDATE _pgshift_workflow_steps
       SET status = 'failed', error = $1
       WHERE run_id = $2 AND step = $3`,
      [`[PgShift] No handler registered for "${config.handler}"`, runId, step],
    )
    return
  }

  const ctx: WorkflowContext = {
    runId,
    step,
    input,
    attempt: claimed.attempts + 1,
    previousSteps: previousOutputs,
  }

  try {
    const output = await handler(ctx)

    await pool.query(
      `UPDATE _pgshift_workflow_steps
       SET status = 'completed', output = $1::jsonb,
           completed_at = NOW(), locked_at = NULL, locked_by = NULL
       WHERE run_id = $2 AND step = $3`,
      [JSON.stringify(output ?? {}), runId, step],
    )
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    const maxRetries = config.retries ?? 3

    if (claimed.attempts >= maxRetries) {
      await pool.query(
        `UPDATE _pgshift_workflow_steps
         SET status = 'failed', error = $1, locked_at = NULL, locked_by = NULL
         WHERE run_id = $2 AND step = $3`,
        [error, runId, step],
      )
    } else {
      const backoffMs = Math.min(1000 * 2 ** claimed.attempts, 30_000)
      await pool.query(
        `UPDATE _pgshift_workflow_steps
         SET status = 'pending', error = $1, locked_at = NULL, locked_by = NULL,
             started_at = NOW() + ($2 || ' milliseconds')::INTERVAL
         WHERE run_id = $3 AND step = $4`,
        [error, backoffMs, runId, step],
      )
    }
  }
}

/**
 * Reaps stale running steps — steps locked by a worker that died.
 * Resets them to pending so they can be retried.
 */
export async function reapStaleSteps(pool: PgPool): Promise<void> {
  await pool.query(
    `UPDATE _pgshift_workflow_steps
     SET status = 'pending', locked_at = NULL, locked_by = NULL
     WHERE status = 'running'
       AND locked_at < NOW() - ($1 || ' milliseconds')::INTERVAL`,
    [STALE_TIMEOUT_MS],
  )
}

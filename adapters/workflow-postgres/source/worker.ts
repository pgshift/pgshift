import type { WorkflowContext, WorkflowStepConfig } from './adapter'
import type { DagConfig } from './dag'
import { advanceRun, reapStaleSteps } from './executor'

import type { PgPool } from './pool'

const POLL_INTERVAL_MS = 1_000

export interface WorkerOptions {
  pollInterval?: number
}

/**
 * Starts the workflow worker loop.
 *
 * On each tick:
 * 1. Reap stale running steps (worker crash recovery)
 * 2. Find all active runs for this workflow
 * 3. Advance each run — dispatch ready steps, check completion
 *
 * Returns a stop function for graceful shutdown.
 */
export function startWorkflowWorker(
  pool: PgPool,
  workflowName: string,
  dag: DagConfig,
  stepsConfig: Record<string, WorkflowStepConfig>,
  handlers: Record<string, (ctx: WorkflowContext) => Promise<unknown>>,
  options: WorkerOptions = {},
): () => Promise<void> {
  const pollInterval = options.pollInterval ?? POLL_INTERVAL_MS
  let running = true
  let activePromise: Promise<void> = Promise.resolve()

  const loop = async (): Promise<void> => {
    while (running) {
      activePromise = tick(pool, workflowName, dag, stepsConfig, handlers)
      await activePromise
      await sleep(pollInterval)
    }
  }

  loop()

  return async () => {
    running = false
    await activePromise
  }
}

async function tick(
  pool: PgPool,
  workflowName: string,
  dag: DagConfig,
  stepsConfig: Record<string, WorkflowStepConfig>,
  handlers: Record<string, (ctx: WorkflowContext) => Promise<unknown>>,
): Promise<void> {
  await reapStaleSteps(pool)

  // Find all active runs for this workflow
  const runs = await pool.query<{ id: string; input: Record<string, unknown> }>(
    `SELECT id, input FROM _pgshift_workflow_runs
     WHERE workflow = $1 AND status = 'running'`,
    [workflowName],
  )

  // Advance each run in parallel
  await Promise.all(
    runs.map((run) =>
      advanceRun(
        pool,
        run.id,
        workflowName,
        dag,
        stepsConfig,
        handlers,
        run.input,
      ).catch((err) =>
        console.error(`[PgShift] Error advancing run ${run.id}:`, err),
      ),
    ),
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

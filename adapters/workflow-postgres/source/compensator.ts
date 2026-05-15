import type { WorkflowContext, WorkflowStepConfig } from './adapter'
import { type DagConfig, compensationOrder } from './dag'
import type { PgPool } from './pool'

/**
 * Triggers compensation for a failed run.
 *
 * Compensation runs in reverse topological order — the last completed
 * step is compensated first, working backwards to the first.
 *
 * Only steps that:
 * - Have status = 'completed'
 * - Have a `compensate` handler defined
 * are compensated.
 *
 * Each compensation step runs independently. Failures are logged but
 * do not stop the compensation chain.
 */
export async function compensateRun(
  pool: PgPool,
  runId: string,
  workflowName: string,
  dag: DagConfig,
  stepsConfig: Record<string, WorkflowStepConfig>,
  handlers: Record<string, (ctx: WorkflowContext) => Promise<unknown>>,
  input: Record<string, unknown>,
  previousOutputs: Record<string, unknown>,
): Promise<void> {
  // Mark run as compensating
  await pool.query(
    `UPDATE _pgshift_workflow_runs SET status = 'compensating' WHERE id = $1`,
    [runId],
  )

  // Find completed steps with compensation handlers
  const completedRows = await pool.query<{
    step: string
    output: Record<string, unknown> | null
  }>(
    `SELECT step, output FROM _pgshift_workflow_steps
     WHERE run_id = $1 AND status IN ('completed', 'failed')`,
    [runId],
  )

  const completedSteps = completedRows.map((r) => r.step)
  const stepsWithCompensation = new Set(
    Object.entries(stepsConfig)
      .filter(([, cfg]) => cfg.compensate)
      .map(([name]) => name),
  )

  const order = compensationOrder(dag, completedSteps, stepsWithCompensation)

  for (const step of order) {
    const compensateHandler = stepsConfig[step]?.compensate
    if (!compensateHandler || !handlers[compensateHandler]) continue

    // Mark step as compensating
    await pool.query(
      `UPDATE _pgshift_workflow_steps SET status = 'compensating' WHERE run_id = $1 AND step = $2`,
      [runId, step],
    )

    try {
      const ctx: WorkflowContext = {
        runId,
        step,
        input,
        attempt: 1,
        previousSteps: previousOutputs,
      }

      await handlers[compensateHandler](ctx)

      await pool.query(
        `UPDATE _pgshift_workflow_steps
         SET status = 'compensated', completed_at = NOW()
         WHERE run_id = $1 AND step = $2`,
        [runId, step],
      )
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      console.error(
        `[PgShift] Compensation failed for step "${step}" in run "${runId}": ${error}`,
      )

      await pool.query(
        `UPDATE _pgshift_workflow_steps
         SET error = $1
         WHERE run_id = $1 AND step = $2`,
        [error, runId, step],
      )
    }
  }

  // Mark run as compensated
  await pool.query(
    `UPDATE _pgshift_workflow_runs
     SET status = 'compensated', finished_at = NOW()
     WHERE id = $1`,
    [runId],
  )
}

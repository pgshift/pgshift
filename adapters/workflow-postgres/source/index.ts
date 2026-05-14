import type { PgShiftConfig, WorkflowAdapter } from '@pgshift/core'
import { createPostgresWorkflowAdapter as adapterCreatePostgresWorkflowAdapter } from './adapter'
import { PgPool } from './pool'

export type { WorkflowContext, WorkflowStepConfig } from './adapter.js'

/**
 * Internal factory used by @pgshift/worflow.
 * Not intended to be imported directly by application code.
 */
export function createPostgresWorkflowAdapter(
  config: PgShiftConfig,
): WorkflowAdapter {
  const pool = new PgPool(config)
  return adapterCreatePostgresWorkflowAdapter(pool)
}

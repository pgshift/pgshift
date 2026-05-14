import type {
  StateAdapter,
  StateApprovalOptions,
  StateAuditConfig,
  StateConsensusConfig,
  StateDefinition,
  StateHistoryEntry,
  StateNormalizeConfig,
  StatePendingApproval,
} from '@pgshift/core'
import { installAuditTrigger } from './audit'
import {
  getPendingApprovals,
  installConsensusTrigger,
  recordApproval,
} from './consensus'
import { installNormalizeTrigger } from './normalizer'
import type { PgPool } from './pool'
import { installTransitionTrigger } from './transitions'

export function createPostgresStateAdapter(pool: PgPool): StateAdapter {
  return {
    name: 'postgres',

    // -------------------------------------------------------------------------
    // define — installs state machine trigger
    // -------------------------------------------------------------------------
    async define(table: string, config: StateDefinition): Promise<void> {
      await installTransitionTrigger(pool, table, config)
    },

    // -------------------------------------------------------------------------
    // normalize — installs data normalization trigger
    // -------------------------------------------------------------------------
    async normalize(
      table: string,
      config: StateNormalizeConfig,
    ): Promise<void> {
      await installNormalizeTrigger(pool, table, config)
    },

    // -------------------------------------------------------------------------
    // audit — installs immutable audit log trigger
    // -------------------------------------------------------------------------
    async audit(table: string, config?: StateAuditConfig): Promise<void> {
      await installAuditTrigger(pool, table, config)
    },

    // -------------------------------------------------------------------------
    // consensus — installs N-approval gate trigger
    // -------------------------------------------------------------------------
    async consensus(
      table: string,
      config: StateConsensusConfig,
    ): Promise<void> {
      await installConsensusTrigger(pool, table, config)
    },

    // -------------------------------------------------------------------------
    // approve — records an approval for a given entity
    // -------------------------------------------------------------------------
    async approve(
      table: string,
      entityId: string,
      options: StateApprovalOptions,
    ): Promise<void> {
      // Find all consensus configs for this table to know which transitions exist
      const tables = await pool.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables
         WHERE schemaname = current_schema()
           AND tablename LIKE '_pgshift_consensus_${table}_%'`,
      )

      if (tables.length === 0) {
        throw new Error(
          `[PgShift] No consensus configured for table "${table}". ` +
            `Call db.state("${table}").consensus({ ... }) first.`,
        )
      }

      // Record approval in all relevant consensus tables for this entity
      for (const { tablename } of tables) {
        const transition = tablename.replace(`_pgshift_consensus_${table}_`, '')
        await recordApproval(pool, table, transition, entityId, options)
      }
    },

    // -------------------------------------------------------------------------
    // history — returns audit log for a given entity
    // -------------------------------------------------------------------------
    async history(
      table: string,
      entityId: string,
    ): Promise<StateHistoryEntry[]> {
      const rows = await pool.query<{
        id: string
        entity_id: string
        field: string
        from_value: string | null
        to_value: string
        changed_by: string | null
        changed_at: Date
      }>(
        `SELECT id, entity_id, field, from_value, to_value, changed_by, changed_at
         FROM _pgshift_state_audit
         WHERE table_name = $1 AND entity_id = $2
         ORDER BY changed_at ASC`,
        [table, entityId],
      )

      return rows.map((r) => ({
        id: r.id,
        entityId: r.entity_id,
        field: r.field,
        fromValue: r.from_value,
        toValue: r.to_value,
        changedBy: r.changed_by,
        changedAt: r.changed_at,
      }))
    },

    // -------------------------------------------------------------------------
    // pendingApprovals — returns pending approvals for a given entity
    // -------------------------------------------------------------------------
    async pendingApprovals(
      table: string,
      entityId: string,
    ): Promise<StatePendingApproval[]> {
      return getPendingApprovals(pool, table, entityId)
    },

    // -------------------------------------------------------------------------
    // teardown
    // -------------------------------------------------------------------------
    async teardown(): Promise<void> {
      await pool.end()
    },
  }
}

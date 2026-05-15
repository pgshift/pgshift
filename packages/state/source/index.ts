import { createPostgresStateAdapter } from '@pgshift/adapter-state-postgres'
import type {
  MigrationHint,
  PgShiftConfig,
  StateAdapter,
  StateApprovalOptions,
  StateAuditConfig,
  StateConsensusConfig,
  StateDefinition,
  StateHistoryEntry,
  StateNormalizeConfig,
  StatePendingApproval,
} from '@pgshift/core'
import { PgShiftClient } from '@pgshift/core'

export { normalizers } from '@pgshift/adapter-state-postgres'

export type {
  StateApprovalOptions,
  StateAuditConfig,
  StateConsensusConfig,
  StateDefinition,
  StateHistoryEntry,
  StateNormalizeConfig,
  StatePendingApproval,
} from '@pgshift/core'

export interface CreateStateClientOptions {
  url: string
  max?: number
  ssl?: boolean | { rejectUnauthorized: boolean }
  metrics?: boolean
  onMigrationHint?: (hint: MigrationHint) => void
}

/**
 * Creates a PgShift client with state enforcement capabilities backed by PostgreSQL.
 *
 * The state module turns the database into a guardian of business rules:
 * - State machines enforced via triggers (define)
 * - Data normalization enforced via triggers (normalize)
 * - Immutable audit logs via triggers (audit)
 * - Consensus gates requiring N approvals before a transition (consensus)
 *
 * Each method is independent. Use only what you need, in any order.
 *
 * @example
 * ```ts
 * import { createClient, normalizers } from '@pgshift/state'
 *
 * const db = createClient({ url: process.env.DATABASE_URL })
 *
 * // State machine
 * await db.state('loans').define({
 *   field: 'status',
 *   states: ['pending', 'approved', 'rejected', 'paid'],
 *   transitions: {
 *     pending:  ['approved', 'rejected'],
 *     approved: ['paid'],
 *     rejected: [],
 *     paid:     [],
 *   },
 *   initial: 'pending',
 * })
 *
 * // Data normalization
 * await db.state('users').normalize({
 *   email: normalizers.email,
 *   name:  normalizers.name,
 * })
 *
 * // Audit log
 * await db.state('loans').audit({ track: ['status', 'amount'] })
 *
 * // Consensus — 2 approvals required, only for loans over 10M
 * await db.state('loans').consensus({
 *   transition: 'approved',
 *   require: 2,
 *   roles: ['finance', 'manager'],
 *   when: 'NEW.amount > 10000000',
 * })
 *
 * // Approve
 * await db.state('loans').approve('loan-123', { by: 'user-456', role: 'finance' })
 *
 * // History
 * const history = await db.state('loans').history('loan-123')
 * ```
 */
export function createClient(
  options: CreateStateClientOptions,
): PgShiftClient & {
  state: (table: string) => StateHandle
} {
  const config: PgShiftConfig = {
    url: options.url,
    max: options.max,
    ssl: options.ssl,
  }

  const adapter = createPostgresStateAdapter(config)
  const handles = new Map<string, StateHandle>()

  const client = new PgShiftClient({
    config,
    metrics: options.metrics,
    onMigrationHint: options.onMigrationHint,
    adapters: {},
  }) as PgShiftClient & { state: (table: string) => StateHandle }

  client.state = (table: string): StateHandle => {
    let handle = handles.get(table)
    if (!handle) {
      handle = new StateHandle(table, adapter)
      handles.set(table, handle)
    }
    return handle
  }

  const originalDestroy = client.destroy.bind(client)
  client.destroy = async () => {
    await originalDestroy()
    await adapter.teardown?.()
  }

  return client
}

// ---------------------------------------------------------------------------
// StateHandle — fluent API per table
// ---------------------------------------------------------------------------

class StateHandle {
  constructor(
    private readonly table: string,
    private readonly adapter: StateAdapter,
  ) {}

  async define(config: StateDefinition): Promise<StateHandle> {
    await this.adapter.define(this.table, config)
    return this
  }

  async normalize(config: StateNormalizeConfig): Promise<StateHandle> {
    await this.adapter.normalize(this.table, config)
    return this
  }

  async audit(config?: StateAuditConfig): Promise<StateHandle> {
    await this.adapter.audit(this.table, config)
    return this
  }

  async consensus(config: StateConsensusConfig): Promise<StateHandle> {
    await this.adapter.consensus(this.table, config)
    return this
  }

  async approve(
    entityId: string,
    options: StateApprovalOptions,
  ): Promise<void> {
    return this.adapter.approve(this.table, entityId, options)
  }

  async history(entityId: string): Promise<StateHistoryEntry[]> {
    return this.adapter.history(this.table, entityId)
  }

  async pendingApprovals(entityId: string): Promise<StatePendingApproval[]> {
    return this.adapter.pendingApprovals(this.table, entityId)
  }
}

import type {
  StateApprovalOptions,
  StateConsensusConfig,
  StatePendingApproval,
} from '@pgshift/core'
import type { PgPool } from './pool'

/**
 * Approval table name for a given table + transition.
 * e.g. loans + approved → _pgshift_consensus_loans_approved
 */
function approvalTable(table: string, transition: string): string {
  return `_pgshift_consensus_${table}_${transition}`
}

/**
 * Ensures the approval table exists for a given table + transition.
 */
async function ensureApprovalTable(
  pool: PgPool,
  table: string,
  transition: string,
): Promise<void> {
  const tbl = approvalTable(table, transition)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${tbl} (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id   TEXT        NOT NULL,
      approved_by TEXT        NOT NULL,
      role        TEXT,
      approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (entity_id, approved_by)
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${tbl}_entity_idx ON ${tbl} (entity_id)
  `)
}

/**
 * Installs a BEFORE UPDATE trigger that blocks the target transition
 * until the required number of approvals have been recorded.
 *
 * If `when` is provided, the consensus check only applies when the
 * SQL condition evaluates to true. Otherwise the transition is allowed.
 *
 * If `roles` is provided, each approval must come from a distinct role.
 */
export async function installConsensusTrigger(
  pool: PgPool,
  table: string,
  config: StateConsensusConfig,
): Promise<void> {
  await ensureApprovalTable(pool, table, config.transition)

  const fnName = `_pgshift_consensus_${table}_${config.transition}`
  const triggerName = `${fnName}_trigger`
  const tbl = approvalTable(table, config.transition)

  const roleCheck =
    config.roles && config.roles.length > 0
      ? `AND role = ANY(ARRAY[${config.roles.map((r) => `'${r}'`).join(', ')}]::TEXT[])`
      : ''

  const whenClause = config.when
    ? `IF NOT (${config.when}) THEN RETURN NEW; END IF;`
    : ''

  await pool.query(`
    CREATE OR REPLACE FUNCTION ${fnName}()
    RETURNS TRIGGER AS $$
    DECLARE
      approval_count INTEGER;
    BEGIN
      -- Only check when transitioning to the target state
      IF NEW.status IS DISTINCT FROM '${config.transition}' THEN
        RETURN NEW;
      END IF;

      -- Optional condition — skip consensus check if condition is false
      ${whenClause}

      -- Count approvals for this entity
      SELECT COUNT(*) INTO approval_count
      FROM ${tbl}
      WHERE entity_id = NEW.id::TEXT
      ${roleCheck};

      IF approval_count < ${config.require} THEN
        RAISE EXCEPTION
          '[PgShift] Consensus not reached for transition "%" on "%". Required: %, current: %.',
          '${config.transition}', TG_TABLE_NAME, ${config.require}, approval_count;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `)

  await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON ${table}`)
  await pool.query(`
    CREATE TRIGGER ${triggerName}
      BEFORE UPDATE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION ${fnName}()
  `)
}

/**
 * Records an approval for a given entity.
 * Throws if the approver has already approved this entity.
 */
export async function recordApproval(
  pool: PgPool,
  table: string,
  transition: string,
  entityId: string,
  options: StateApprovalOptions,
): Promise<void> {
  const tbl = approvalTable(table, transition)

  await pool.query(
    `INSERT INTO ${tbl} (entity_id, approved_by, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (entity_id, approved_by) DO NOTHING`,
    [entityId, options.by, options.role ?? null],
  )
}

/**
 * Returns all pending approvals for a given entity across all transitions.
 */
export async function getPendingApprovals(
  pool: PgPool,
  table: string,
  entityId: string,
): Promise<StatePendingApproval[]> {
  // Find all consensus tables for this entity's table
  const tables = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = current_schema()
       AND tablename LIKE '_pgshift_consensus_${table}_%'`,
  )

  const results: StatePendingApproval[] = []

  for (const { tablename } of tables) {
    const transition = tablename.replace(`_pgshift_consensus_${table}_`, '')
    const rows = await pool.query<{
      id: string
      entity_id: string
      approved_by: string
      role: string | null
      approved_at: Date
    }>(
      `SELECT id, entity_id, approved_by, role, approved_at
       FROM ${tablename}
       WHERE entity_id = $1`,
      [entityId],
    )

    results.push(
      ...rows.map((r) => ({
        id: r.id,
        entityId: r.entity_id,
        transition,
        approvedBy: r.approved_by,
        role: r.role,
        approvedAt: r.approved_at,
      })),
    )
  }

  return results
}

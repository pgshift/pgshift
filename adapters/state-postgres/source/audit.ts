import type { StateAuditConfig } from '@pgshift/core'
import type { PgPool } from './pool'

/**
 * Ensures the shared audit log table exists.
 * All audited tables write to _pgshift_state_audit.
 */
export async function ensureAuditTable(pool: PgPool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _pgshift_state_audit (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      table_name  TEXT        NOT NULL,
      entity_id   TEXT        NOT NULL,
      field       TEXT        NOT NULL,
      from_value  TEXT,
      to_value    TEXT,
      changed_by  TEXT,
      changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS _pgshift_state_audit_entity_idx
      ON _pgshift_state_audit (table_name, entity_id, changed_at DESC)
  `)
}

/**
 * Installs an AFTER INSERT OR UPDATE trigger that writes an immutable
 * audit entry for each changed field.
 *
 * The trigger compares OLD and NEW values for each tracked field and
 * inserts a row into _pgshift_state_audit only when the value changed.
 *
 * The audit table is append-only by design. No rows are ever deleted.
 */
export async function installAuditTrigger(
  pool: PgPool,
  table: string,
  config: StateAuditConfig = {},
): Promise<void> {
  await ensureAuditTable(pool)

  const fnName = `_pgshift_audit_${table}`
  const triggerName = `_pgshift_audit_${table}_trigger`

  // If no fields specified, track all columns dynamically via hstore diff
  // If fields specified, generate explicit per-field checks
  const trackClause =
    config.track && config.track.length > 0
      ? config.track
          .map(
            (field) => `
      IF (TG_OP = 'INSERT') OR (OLD.${field}::TEXT IS DISTINCT FROM NEW.${field}::TEXT) THEN
        INSERT INTO _pgshift_state_audit (table_name, entity_id, field, from_value, to_value)
        VALUES (
          TG_TABLE_NAME,
          NEW.id::TEXT,
          '${field}',
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.${field}::TEXT END,
          NEW.${field}::TEXT
        );
      END IF;`,
          )
          .join('\n')
      : `
      -- Track all columns via jsonb diff
      DECLARE
        col_name TEXT;
        old_val TEXT;
        new_val TEXT;
      BEGIN
        FOR col_name IN
          SELECT column_name FROM information_schema.columns
          WHERE table_name = TG_TABLE_NAME AND table_schema = TG_TABLE_SCHEMA
        LOOP
          EXECUTE format('SELECT ($1).%I::TEXT', col_name) INTO new_val USING NEW;
          IF TG_OP = 'INSERT' THEN
            old_val := NULL;
          ELSE
            EXECUTE format('SELECT ($1).%I::TEXT', col_name) INTO old_val USING OLD;
          END IF;

          IF old_val IS DISTINCT FROM new_val THEN
            INSERT INTO _pgshift_state_audit (table_name, entity_id, field, from_value, to_value)
            VALUES (TG_TABLE_NAME, NEW.id::TEXT, col_name, old_val, new_val);
          END IF;
        END LOOP;
      END;`

  // When tracking specific fields, use a simpler function structure
  if (config.track && config.track.length > 0) {
    await pool.query(`
      CREATE OR REPLACE FUNCTION ${fnName}()
      RETURNS TRIGGER AS $$
      BEGIN
        ${trackClause}
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)
  } else {
    await pool.query(`
      CREATE OR REPLACE FUNCTION ${fnName}()
      RETURNS TRIGGER AS $$
      DECLARE
        col_name TEXT;
        old_val TEXT;
        new_val TEXT;
      BEGIN
        FOR col_name IN
          SELECT column_name FROM information_schema.columns
          WHERE table_name = TG_TABLE_NAME AND table_schema = current_schema()
        LOOP
          EXECUTE format('SELECT ($1).%I::TEXT', col_name) INTO new_val USING NEW;
          IF TG_OP = 'INSERT' THEN
            old_val := NULL;
          ELSE
            EXECUTE format('SELECT ($1).%I::TEXT', col_name) INTO old_val USING OLD;
          END IF;

          IF old_val IS DISTINCT FROM new_val THEN
            INSERT INTO _pgshift_state_audit (table_name, entity_id, field, from_value, to_value)
            VALUES (TG_TABLE_NAME, NEW.id::TEXT, col_name, old_val, new_val);
          END IF;
        END LOOP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)
  }

  await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON ${table}`)

  await pool.query(`
    CREATE TRIGGER ${triggerName}
      AFTER INSERT OR UPDATE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION ${fnName}()
  `)
}

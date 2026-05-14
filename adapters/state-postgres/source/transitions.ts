import type { StateDefinition } from '@pgshift/core'
import type { PgPool } from './pool'

/**
 * Installs a BEFORE UPDATE trigger that enforces valid state transitions.
 *
 * The trigger reads the current value of `field` and checks if the new
 * value is an allowed transition. If not, it raises an exception.
 *
 * Also installs a BEFORE INSERT trigger that sets the initial value
 * if `initial` is provided and the field is null.
 */
export async function installTransitionTrigger(
  pool: PgPool,
  table: string,
  config: StateDefinition,
): Promise<void> {
  const fnName = `_pgshift_state_transition_${table}`
  const triggerName = `_pgshift_state_transition_${table}_trigger`
  const field = config.field

  // Build the transition map as a SQL CASE expression
  // e.g. WHEN 'pending' THEN ARRAY['approved','rejected']
  const cases = Object.entries(config.transitions)
    .map(([from, to]) => {
      const allowed = to.map((s) => `'${s}'`).join(', ')
      return `WHEN '${from}' THEN ARRAY[${allowed}]::TEXT[]`
    })
    .join('\n      ')

  const initialClause = config.initial
    ? `
  -- Set initial state on INSERT if field is null
  IF TG_OP = 'INSERT' AND NEW.${field} IS NULL THEN
    NEW.${field} := '${config.initial}';
    RETURN NEW;
  END IF;
`
    : ''

  await pool.query(`
    CREATE OR REPLACE FUNCTION ${fnName}()
    RETURNS TRIGGER AS $$
    DECLARE
      allowed_transitions TEXT[];
    BEGIN
      ${initialClause}

      -- On UPDATE, validate the transition
      IF TG_OP = 'UPDATE' AND OLD.${field} IS DISTINCT FROM NEW.${field} THEN
        allowed_transitions := CASE OLD.${field}
          ${cases}
          ELSE ARRAY[]::TEXT[]
        END;

        IF NOT (NEW.${field} = ANY(allowed_transitions)) THEN
          RAISE EXCEPTION
            '[PgShift] Invalid state transition on table "%": "%" -> "%" is not allowed.',
            TG_TABLE_NAME, OLD.${field}, NEW.${field};
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `)

  await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON ${table}`)
  await pool.query(`
    CREATE TRIGGER ${triggerName}
      BEFORE INSERT OR UPDATE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION ${fnName}()
  `)
}

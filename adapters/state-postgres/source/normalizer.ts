import type { PgPool } from './pool'

/**
 * Installs a BEFORE INSERT OR UPDATE trigger that normalizes field values.
 *
 * Each field maps to a SQL expression applied to NEW.<field>.
 * The expression receives the raw value and must return the normalized value.
 *
 * Built-in helpers are provided for common cases:
 *   email  → LOWER(TRIM(NEW.email))
 *   phone  → REGEXP_REPLACE(NEW.phone, '\D', '', 'g')
 *   name   → TRIM(NEW.name)
 *
 * Custom SQL expressions are also accepted.
 */
export async function installNormalizeTrigger(
  pool: PgPool,
  table: string,
  fields: Record<string, string>,
): Promise<void> {
  const fnName = `_pgshift_normalize_${table}`
  const triggerName = `_pgshift_normalize_${table}_trigger`

  // Build normalization assignments
  // e.g. NEW.email := LOWER(TRIM(NEW.email));
  const assignments = Object.entries(fields)
    .map(([field, expr]) => {
      // Replace placeholder {value} with actual NEW.field reference
      const sql = expr.replace(/\{value\}/g, `NEW.${field}`)
      return `IF NEW.${field} IS NOT NULL THEN\n        NEW.${field} := ${sql};\n      END IF;`
    })
    .join('\n      ')

  await pool.query(`
    CREATE OR REPLACE FUNCTION ${fnName}()
    RETURNS TRIGGER AS $$
    BEGIN
      ${assignments}
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

/**
 * Built-in normalizer expressions.
 * Use these as values in the normalize() config.
 */
export const normalizers = {
  /** Trim whitespace and convert to lowercase */
  email: 'LOWER(TRIM({value}))',
  /** Remove all non-digit characters */
  phone: "REGEXP_REPLACE({value}, '\\D', '', 'g')",
  /** Trim leading and trailing whitespace */
  trim: 'TRIM({value})',
  /** Convert to lowercase */
  lowercase: 'LOWER({value})',
  /** Convert to uppercase */
  uppercase: 'UPPER({value})',
  /** Trim and collapse multiple spaces into one */
  name: "TRIM(REGEXP_REPLACE({value}, '\\s+', ' ', 'g'))",
}

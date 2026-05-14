---
title: state-postgres
description: PostgreSQL state adapter for PgShift.
---

The default state adapter. Implements state machines, data normalization, audit logs, and consensus gates via PostgreSQL triggers.

This adapter is bundled with `@pgshift/state`. You do not need to install it separately.

## How it works

Each capability installs one or more independent triggers on the target table. Triggers fire on every write regardless of origin — API, migration, admin, or internal script.

**State machine** — `BEFORE INSERT OR UPDATE` trigger that validates state transitions:

```sql
CREATE OR REPLACE FUNCTION _pgshift_state_transition_loans()
RETURNS TRIGGER AS $$
DECLARE
  allowed_transitions TEXT[];
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    allowed_transitions := CASE OLD.status
      WHEN 'pending'  THEN ARRAY['approved', 'rejected']
      WHEN 'approved' THEN ARRAY['paid']
      WHEN 'rejected' THEN ARRAY[]::TEXT[]
      WHEN 'paid'     THEN ARRAY[]::TEXT[]
      ELSE ARRAY[]::TEXT[]
    END;

    IF NOT (NEW.status = ANY(allowed_transitions)) THEN
      RAISE EXCEPTION '[PgShift] Invalid state transition on table "%": "%" -> "%" is not allowed.',
        TG_TABLE_NAME, OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Normalization** — `BEFORE INSERT OR UPDATE` trigger that applies SQL expressions to field values:

```sql
CREATE OR REPLACE FUNCTION _pgshift_normalize_users()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := LOWER(TRIM(NEW.email));
  END IF;
  IF NEW.name IS NOT NULL THEN
    NEW.name := TRIM(REGEXP_REPLACE(NEW.name, '\s+', ' ', 'g'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Audit** — `AFTER INSERT OR UPDATE` trigger that writes to the shared `_pgshift_state_audit` table.

**Consensus** — `BEFORE UPDATE` trigger that counts approvals before allowing a target transition:

```sql
-- Blocks transition to 'approved' until 2 approvals exist in the approval table
IF approval_count < 2 THEN
  RAISE EXCEPTION '[PgShift] Consensus not reached for transition "approved" on "loans". Required: 2, current: %.',
    approval_count;
END IF;
```

## Requirements

- PostgreSQL 12 or later
- No extensions required

## Trigger naming

All triggers and functions follow a predictable naming convention:

| Trigger | Name pattern |
|---|---|
| State machine | `_pgshift_state_transition_{table}_trigger` |
| Normalization | `_pgshift_normalize_{table}_trigger` |
| Audit | `_pgshift_audit_{table}_trigger` |
| Consensus | `_pgshift_consensus_{table}_{transition}_trigger` |

This means you can inspect and manage triggers directly via `pg_triggers` if needed.

## Limitations

- Consensus `when` condition is raw SQL evaluated inside the trigger — validate inputs before passing user-supplied strings
- Audit tracking all columns uses `information_schema` introspection and is slower than tracking specific fields
- Triggers add a small overhead per write — measure before using on very high-throughput tables

## Internal tables

| Table | Purpose |
|---|---|
| `_pgshift_state_audit` | Shared append-only audit log for all audited tables |
| `_pgshift_consensus_{table}_{transition}` | Approval records per table and transition |

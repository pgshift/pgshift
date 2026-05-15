import { Pool } from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '../../../packages/workflow/source/index'
import { createPool, createSchema, dropSchema, schemaUrl } from '../setup/db'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Shared workflow definition for most tests
// ---------------------------------------------------------------------------

const BASIC_WORKFLOW = {
  steps: {
    step_a: { handler: 'handleA', retries: 2 },
    step_b: { handler: 'handleB', retries: 2 },
    step_c: { handler: 'handleC', retries: 2, compensate: 'compensateC' },
  },
  dag: {
    step_a: [],
    step_b: ['step_a'],
    step_c: ['step_b'],
  },
}

// E-commerce DAG with parallel steps
const ECOMMERCE_WORKFLOW = {
  steps: {
    validate_stock: { handler: 'validateStock', retries: 2 },
    validate_fraud: { handler: 'validateFraud', retries: 2 },
    charge_card: {
      handler: 'chargeCard',
      retries: 1,
      compensate: 'refundCard',
    },
    emit_invoice: { handler: 'emitInvoice', retries: 2 },
    send_email: { handler: 'sendEmail', retries: 3 },
    update_analytics: { handler: 'updateAnalytics', retries: 3 },
  },
  dag: {
    validate_stock: [],
    validate_fraud: [],
    charge_card: ['validate_stock', 'validate_fraud'],
    emit_invoice: ['charge_card'],
    send_email: ['emit_invoice'],
    update_analytics: ['emit_invoice'],
  },
}

describe('workflow integration', () => {
  let pool: Pool
  let schema: string
  let url: string

  beforeEach(async () => {
    pool = createPool()
    schema = await createSchema(pool)
    url = schemaUrl(schema)
  })

  afterEach(async () => {
    await dropSchema(pool, schema)
    await pool.end()
  })

  // -------------------------------------------------------------------------
  // define
  // -------------------------------------------------------------------------

  describe('define', () => {
    it('creates the workflow schema tables without error', async () => {
      const db = createClient({ url })

      await expect(
        db.workflow('test-workflow').define(BASIC_WORKFLOW),
      ).resolves.not.toThrow()

      const { rows } = await pool.query(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = '${schema}'
          AND tablename LIKE '_pgshift_workflow%'
        ORDER BY tablename
      `)

      const tables = rows.map((r: { tablename: string }) => r.tablename)
      expect(tables).toContain('_pgshift_workflow_definitions')
      expect(tables).toContain('_pgshift_workflow_runs')
      expect(tables).toContain('_pgshift_workflow_steps')

      await db.destroy()
    })

    it('is idempotent — calling define twice does not throw', async () => {
      const db = createClient({ url })

      await db.workflow('test-workflow').define(BASIC_WORKFLOW)
      await expect(
        db.workflow('test-workflow').define(BASIC_WORKFLOW),
      ).resolves.not.toThrow()

      await db.destroy()
    })

    it('stores the definition in the database', async () => {
      const db = createClient({ url })

      await db.workflow('test-workflow').define(BASIC_WORKFLOW)

      const { rows } = await pool.query(
        `SELECT name, steps, dag FROM ${schema}._pgshift_workflow_definitions WHERE name = 'test-workflow'`,
      )

      expect(rows).toHaveLength(1)
      expect(rows[0]?.name).toBe('test-workflow')

      await db.destroy()
    })

    it('throws on an invalid DAG — undefined dependency', async () => {
      const db = createClient({ url })

      await expect(
        db.workflow('bad-workflow').define({
          steps: { step_a: { handler: 'handleA' } },
          dag: { step_a: ['nonexistent_step'] },
        }),
      ).rejects.toThrow('"nonexistent_step"')

      await db.destroy()
    })

    it('throws on a cyclic DAG', async () => {
      const db = createClient({ url })

      await expect(
        db.workflow('cyclic').define({
          steps: {
            step_a: { handler: 'handleA' },
            step_b: { handler: 'handleB' },
          },
          dag: {
            step_a: ['step_b'],
            step_b: ['step_a'],
          },
        }),
      ).rejects.toThrow('cycle')

      await db.destroy()
    })
  })

  // -------------------------------------------------------------------------
  // run
  // -------------------------------------------------------------------------

  describe('run', () => {
    it('creates a run and returns a UUID', async () => {
      const db = createClient({ url })
      await db.workflow('test-workflow').define(BASIC_WORKFLOW)

      const runId = await db.workflow('test-workflow').run({ orderId: '123' })

      expect(runId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      )

      await db.destroy()
    })

    it('initializes a pending step row for each step in the DAG', async () => {
      const db = createClient({ url })
      await db.workflow('test-workflow').define(BASIC_WORKFLOW)

      const runId = await db.workflow('test-workflow').run({})

      const { rows } = await pool.query(
        `SELECT step, status FROM ${schema}._pgshift_workflow_steps WHERE run_id = $1 ORDER BY step`,
        [runId],
      )

      expect(rows).toHaveLength(3)
      expect(
        rows.every((r: { status: string }) => r.status === 'pending'),
      ).toBe(true)

      await db.destroy()
    })

    it('throws when workflow has not been defined', async () => {
      const db = createClient({ url })

      await expect(db.workflow('undefined-workflow').run({})).rejects.toThrow(
        'has not been defined',
      )

      await db.destroy()
    })
  })

  // -------------------------------------------------------------------------
  // status
  // -------------------------------------------------------------------------

  describe('status', () => {
    it('returns the correct initial status for a new run', async () => {
      const db = createClient({ url })
      await db.workflow('test-workflow').define(BASIC_WORKFLOW)

      const runId = await db.workflow('test-workflow').run({ input: 'data' })
      const status = await db.workflow('test-workflow').status(runId)

      expect(status.runId).toBe(runId)
      expect(status.workflow).toBe('test-workflow')
      expect(status.status).toBe('running')
      expect(status.input).toMatchObject({ input: 'data' })
      expect(Object.keys(status.steps).sort()).toEqual([
        'step_a',
        'step_b',
        'step_c',
      ])

      await db.destroy()
    })

    it('throws for a non-existent run ID', async () => {
      const db = createClient({ url })
      await db.workflow('test-workflow').define(BASIC_WORKFLOW)

      await expect(
        db
          .workflow('test-workflow')
          .status('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow('not found')

      await db.destroy()
    })
  })

  // -------------------------------------------------------------------------
  // sequential execution
  // -------------------------------------------------------------------------

  describe('sequential execution', () => {
    it('executes all steps and marks run as completed', async () => {
      const db = createClient({ url })
      await db.workflow('test-workflow').define(BASIC_WORKFLOW)

      const executed: string[] = []

      await db.workflow('test-workflow').handlers({
        handleA: async () => {
          executed.push('step_a')
          return { a: true }
        },
        handleB: async () => {
          executed.push('step_b')
          return { b: true }
        },
        handleC: async () => {
          executed.push('step_c')
          return { c: true }
        },
        compensateC: async () => {},
      })

      await db.workflow('test-workflow').work()

      const runId = await db.workflow('test-workflow').run({})

      await sleep(5_000)
      await db.destroy()

      expect(executed).toEqual(['step_a', 'step_b', 'step_c'])

      const { rows } = await pool.query(
        `SELECT status FROM ${schema}._pgshift_workflow_runs WHERE id = $1`,
        [runId],
      )
      expect(rows[0]?.status).toBe('completed')
    })

    it('passes input and previous step outputs to handlers via context', async () => {
      const db = createClient({ url })
      await db.workflow('test-workflow').define(BASIC_WORKFLOW)

      const contexts: unknown[] = []

      await db.workflow('test-workflow').handlers({
        handleA: async (ctx) => {
          contexts.push({ step: ctx.step, input: ctx.input })
          return { fromA: 'output-a' }
        },
        handleB: async (ctx) => {
          contexts.push({
            step: ctx.step,
            previousA: ctx.previousSteps.step_a,
          })
          return { fromB: 'output-b' }
        },
        handleC: async (ctx) => {
          contexts.push({
            step: ctx.step,
            previousB: ctx.previousSteps.step_b,
          })
          return {}
        },
        compensateC: async () => {},
      })

      await db.workflow('test-workflow').work()
      await db.workflow('test-workflow').run({ userId: 'user-123' })

      await sleep(5_000)
      await db.destroy()

      expect(contexts[0]).toMatchObject({
        step: 'step_a',
        input: { userId: 'user-123' },
      })
      expect(contexts[1]).toMatchObject({
        step: 'step_b',
        previousA: { fromA: 'output-a' },
      })
      expect(contexts[2]).toMatchObject({
        step: 'step_c',
        previousB: { fromB: 'output-b' },
      })
    })
  })

  // -------------------------------------------------------------------------
  // parallel execution
  // -------------------------------------------------------------------------

  describe('parallel execution', () => {
    it('executes independent steps in parallel', async () => {
      const db = createClient({ url })
      await db.workflow('order-fulfillment').define(ECOMMERCE_WORKFLOW)

      const startTimes: Record<string, number> = {}

      await db.workflow('order-fulfillment').handlers({
        validateStock: async () => {
          startTimes.validate_stock = Date.now()
          await sleep(100)
        },
        validateFraud: async () => {
          startTimes.validate_fraud = Date.now()
          await sleep(100)
        },
        chargeCard: async () => {},
        refundCard: async () => {},
        emitInvoice: async () => {},
        sendEmail: async () => {},
        updateAnalytics: async () => {},
      })

      await db.workflow('order-fulfillment').work()
      await db.workflow('order-fulfillment').run({})

      await sleep(3_000)
      await db.destroy()

      // Both root steps should have started at roughly the same time
      const diff = Math.abs(
        (startTimes.validate_stock ?? 0) - (startTimes.validate_fraud ?? 0),
      )
      expect(diff).toBeLessThan(500) // within 500ms of each other
    })

    it('executes terminal parallel steps in parallel after their dependency', async () => {
      const db = createClient({ url })
      await db.workflow('order-fulfillment').define(ECOMMERCE_WORKFLOW)

      const startTimes: Record<string, number> = {}

      await db.workflow('order-fulfillment').handlers({
        validateStock: async () => {},
        validateFraud: async () => {},
        chargeCard: async () => {},
        refundCard: async () => {},
        emitInvoice: async () => {},
        sendEmail: async (ctx: any) => {
          startTimes['send_email'] = Date.now()
          await sleep(100)
        },
        updateAnalytics: async (ctx: any) => {
          startTimes['update_analytics'] = Date.now()
          await sleep(100)
        },
      })

      await db.workflow('order-fulfillment').work()
      await db.workflow('order-fulfillment').run({})

      await sleep(8_000)
      await db.destroy()

      const diff = Math.abs(
        startTimes['send_email']! - startTimes['update_analytics']!,
      )
      expect(diff).toBeLessThan(500)
    })
  })

  // -------------------------------------------------------------------------
  // retry
  // -------------------------------------------------------------------------

  describe('retry', () => {
    it('retries a failing step and eventually completes', async () => {
      const db = createClient({ url })
      await db.workflow('test-workflow').define(BASIC_WORKFLOW)

      let attempts = 0

      await db.workflow('test-workflow').handlers({
        handleA: async () => {
          attempts++
          if (attempts < 3) throw new Error('Transient failure')
          return { done: true }
        },
        handleB: async () => {},
        handleC: async () => {},
        compensateC: async () => {},
      })

      await db.workflow('test-workflow').work()
      const runId = await db.workflow('test-workflow').run({})

      await sleep(15_000)
      await db.destroy()

      expect(attempts).toBeGreaterThanOrEqual(3)

      const { rows } = await pool.query(
        `SELECT status FROM ${schema}._pgshift_workflow_runs WHERE id = $1`,
        [runId],
      )
      expect(rows[0]?.status).toBe('completed')
    })
  })

  // -------------------------------------------------------------------------
  // compensation
  // -------------------------------------------------------------------------

  describe('compensation', () => {
    it('runs compensation in reverse order when a step fails permanently', async () => {
      const db = createClient({ url })
      await db.workflow('test-workflow').define(BASIC_WORKFLOW)

      const executed: string[] = []
      const compensated: string[] = []

      await db.workflow('test-workflow').handlers({
        handleA: async () => {
          executed.push('step_a')
          return {}
        },
        handleB: async () => {
          executed.push('step_b')
          return {}
        },
        handleC: async () => {
          executed.push('step_c')
          throw new Error('Permanent failure') // will exhaust retries
        },
        compensateC: async () => {
          compensated.push('compensate_c')
        },
      })

      await db.workflow('test-workflow').work()
      const runId = await db.workflow('test-workflow').run({})

      // Wait for retries + compensation
      await sleep(10_000)
      await db.destroy()

      const { rows } = await pool.query(
        `SELECT status FROM ${schema}._pgshift_workflow_runs WHERE id = $1`,
        [runId],
      )
      expect(rows[0]?.status).toBe('compensated')
      expect(compensated).toContain('compensate_c')
    })

    it('does not compensate steps without a compensate handler', async () => {
      const db = createClient({ url })
      await db.workflow('test-workflow').define(BASIC_WORKFLOW)

      const compensated: string[] = []

      await db.workflow('test-workflow').handlers({
        handleA: async () => {}, // no compensate
        handleB: async () => {}, // no compensate
        handleC: async () => {
          throw new Error('always fails')
        },
        compensateC: async () => {
          compensated.push('compensate_c')
        },
      })

      await db.workflow('test-workflow').work()
      await db.workflow('test-workflow').run({})

      await sleep(10_000)
      await db.destroy()

      // Only step_c has compensation — step_a and step_b do not
      expect(compensated).toEqual(['compensate_c'])
    })
  })
})

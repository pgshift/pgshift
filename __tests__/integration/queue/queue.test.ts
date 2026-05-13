import { Pool } from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '../../../packages/queue/source/index'
import { createPool, createSchema, dropSchema, schemaUrl } from '../setup/db'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('queue integration', () => {
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
  // setup
  // -------------------------------------------------------------------------

  describe('setup', () => {
    it('creates the queue table without error', async () => {
      const db = createClient({ url })

      await expect(db.queue('emails').setup()).resolves.not.toThrow()

      const { rows } = await pool.query(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = '${schema}' AND tablename = '_pgshift_queue_emails'
      `)
      expect(rows).toHaveLength(1)

      await db.destroy()
    })

    it('is idempotent — calling setup twice does not throw', async () => {
      const db = createClient({ url })

      await db.queue('emails').setup()
      await expect(db.queue('emails').setup()).resolves.not.toThrow()

      await db.destroy()
    })

    it('creates indexes for polling and reaper', async () => {
      const db = createClient({ url })

      await db.queue('emails').setup()

      const { rows } = await pool.query(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = '${schema}'
          AND tablename = '_pgshift_queue_emails'
      `)
      const names = rows.map((r: { indexname: string }) => r.indexname)
      expect(names.some((n: string) => n.includes('poll'))).toBe(true)
      expect(names.some((n: string) => n.includes('reaper'))).toBe(true)

      await db.destroy()
    })
  })

  // -------------------------------------------------------------------------
  // push
  // -------------------------------------------------------------------------

  describe('push', () => {
    it('inserts a job and returns a UUID', async () => {
      const db = createClient({ url })
      await db.queue('emails').setup()

      const jobId = await db.queue('emails').push({ to: 'user@example.com' })

      expect(jobId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      )

      await db.destroy()
    })

    it('inserts job with status pending', async () => {
      const db = createClient({ url })
      await db.queue('emails').setup()

      const jobId = await db.queue('emails').push({ to: 'user@example.com' })

      const { rows } = await pool.query(
        `SELECT status FROM ${schema}._pgshift_queue_emails WHERE id = $1`,
        [jobId],
      )
      expect(rows[0]?.status).toBe('pending')

      await db.destroy()
    })

    it('respects priority option', async () => {
      const db = createClient({ url })
      await db.queue('emails').setup()

      const jobId = await db
        .queue('emails')
        .push({ to: 'user@example.com' }, { priority: 10 })

      const { rows } = await pool.query(
        `SELECT priority FROM ${schema}._pgshift_queue_emails WHERE id = $1`,
        [jobId],
      )
      expect(rows[0]?.priority).toBe(10)

      await db.destroy()
    })

    it('respects delay option — job not visible before run_at', async () => {
      const db = createClient({ url })
      await db.queue('emails').setup()

      await db
        .queue('emails')
        .push({ to: 'user@example.com' }, { delay: 60_000 })

      const { rows } = await pool.query(`
        SELECT id FROM ${schema}._pgshift_queue_emails
        WHERE status = 'pending' AND run_at <= NOW()
      `)
      expect(rows).toHaveLength(0)

      await db.destroy()
    })

    it('respects retries option', async () => {
      const db = createClient({ url })
      await db.queue('emails').setup()

      const jobId = await db
        .queue('emails')
        .push({ to: 'user@example.com' }, { retries: 5 })

      const { rows } = await pool.query(
        `SELECT max_retries FROM ${schema}._pgshift_queue_emails WHERE id = $1`,
        [jobId],
      )
      expect(rows[0]?.max_retries).toBe(5)

      await db.destroy()
    })
  })

  // -------------------------------------------------------------------------
  // process
  // -------------------------------------------------------------------------

  describe('process', () => {
    it('processes a pending job and marks it as done', async () => {
      const db = createClient({ url })
      await db.queue('emails').setup()

      const jobId = await db.queue('emails').push({ to: 'user@example.com' })

      const processed: string[] = []

      await db.queue('emails').process(async (job) => {
        processed.push(job.id)
      })

      await sleep(1_500)
      await db.destroy()

      expect(processed).toContain(jobId)

      const { rows } = await pool.query(
        `SELECT status FROM ${schema}._pgshift_queue_emails WHERE id = $1`,
        [jobId],
      )
      expect(rows[0]?.status).toBe('done')
    })

    it('passes correct job fields to the handler', async () => {
      const db = createClient({ url })
      await db.queue('emails').setup()

      await db.queue('emails').push({ to: 'user@example.com' }, { priority: 5 })

      let capturedJob: unknown = null

      await db.queue('emails').process(async (job) => {
        capturedJob = job
      })

      await sleep(1_500)
      await db.destroy()

      expect(capturedJob).toMatchObject({
        id: expect.any(String),
        payload: { to: 'user@example.com' },
        status: 'processing',
        priority: 5,
        attempts: expect.any(Number),
        maxRetries: expect.any(Number),
        runAt: expect.any(Date),
        createdAt: expect.any(Date),
      })
    })

    it('processes multiple jobs', async () => {
      const db = createClient({ url })
      await db.queue('emails').setup()

      const ids = await Promise.all([
        db.queue('emails').push({ to: 'a@example.com' }),
        db.queue('emails').push({ to: 'b@example.com' }),
        db.queue('emails').push({ to: 'c@example.com' }),
      ])

      const processed: string[] = []

      await db.queue('emails').process(async (job) => {
        processed.push(job.id)
      })

      await sleep(3_000)
      await db.destroy()

      expect(processed.sort()).toEqual(ids.sort())
    })
  })

  // -------------------------------------------------------------------------
  // cancel
  // -------------------------------------------------------------------------

  describe('cancel', () => {
    it('removes a pending job', async () => {
      const db = createClient({ url })
      await db.queue('emails').setup()

      const jobId = await db.queue('emails').push({ to: 'user@example.com' })
      await db.queue('emails').cancel(jobId)

      const { rows } = await pool.query(
        `SELECT id FROM ${schema}._pgshift_queue_emails WHERE id = $1`,
        [jobId],
      )
      expect(rows).toHaveLength(0)

      await db.destroy()
    })

    it('does not throw when cancelling a non-existent job', async () => {
      const db = createClient({ url })
      await db.queue('emails').setup()

      await expect(
        db.queue('emails').cancel('00000000-0000-0000-0000-000000000000'),
      ).resolves.not.toThrow()

      await db.destroy()
    })
  })

  // -------------------------------------------------------------------------
  // retry
  // -------------------------------------------------------------------------

  describe('retry', () => {
    it('requeues a failed job when attempts < max_retries', async () => {
      const db = createClient({ url })
      await db.queue('emails').setup()

      await db.queue('emails').push({ to: 'user@example.com' }, { retries: 3 })

      let attempts = 0

      await db.queue('emails').process(async () => {
        attempts++
        if (attempts < 2) throw new Error('Simulated failure')
      })

      await sleep(5_000)
      await db.destroy()

      expect(attempts).toBeGreaterThanOrEqual(2)
    })
  })

  // -------------------------------------------------------------------------
  // dead letter
  // -------------------------------------------------------------------------

  describe('dead letter', () => {
    it('marks job as failed after exhausting retries', async () => {
      const db = createClient({ url })
      await db.queue('emails').setup()

      const jobId = await db
        .queue('emails')
        .push({ to: 'user@example.com' }, { retries: 2 })

      await db.queue('emails').process(async () => {
        throw new Error('Always fails')
      })

      // Wait for all retry attempts — backoff: 2s + 4s
      await sleep(10_000)
      await db.destroy()

      const { rows } = await pool.query(
        `SELECT status, attempts, error FROM ${schema}._pgshift_queue_emails WHERE id = $1`,
        [jobId],
      )
      expect(rows[0]?.status).toBe('failed')
      expect(rows[0]?.attempts).toBeGreaterThanOrEqual(2)
      expect(rows[0]?.error).toBeTruthy()
    })
  })

  // -------------------------------------------------------------------------
  // stats
  // -------------------------------------------------------------------------

  describe('stats', () => {
    it('returns zero counts for an empty queue', async () => {
      const db = createClient({ url })
      await db.queue('emails').setup()

      const stats = await db.queue('emails').stats()

      expect(stats).toEqual({ pending: 0, processing: 0, done: 0, failed: 0 })

      await db.destroy()
    })

    it('reflects correct counts after pushing jobs', async () => {
      const db = createClient({ url })
      await db.queue('emails').setup()

      await db.queue('emails').push({ to: 'a@example.com' })
      await db.queue('emails').push({ to: 'b@example.com' })
      await db.queue('emails').push({ to: 'c@example.com' }, { delay: 60_000 })

      const stats = await db.queue('emails').stats()

      expect(stats.pending).toBe(2) // 2 immediate jobs
      expect(stats.done).toBe(0)

      await db.destroy()
    })

    it('reflects done count after processing', async () => {
      const db = createClient({ url })
      await db.queue('emails').setup()

      await db.queue('emails').push({ to: 'user@example.com' })

      await db.queue('emails').process(async () => {})

      await sleep(1_500)
      await db.destroy()

      const stats = await db.queue('emails').stats()
      expect(stats.done).toBe(1)
      expect(stats.pending).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // priority
  // -------------------------------------------------------------------------

  describe('priority', () => {
    it('processes higher priority jobs first', async () => {
      const db = createClient({ url })
      await db.queue('emails').setup()

      await db.queue('emails').push({ order: 3 }, { priority: 0 })
      await db.queue('emails').push({ order: 1 }, { priority: 100 })
      await db.queue('emails').push({ order: 2 }, { priority: 50 })

      const processed: number[] = []

      await db.queue('emails').process(async (job) => {
        processed.push((job.payload as { order: number }).order)
        await sleep(100)
      })

      await sleep(2_000)
      await db.destroy()

      expect(processed).toEqual([1, 2, 3])
    })
  })
})

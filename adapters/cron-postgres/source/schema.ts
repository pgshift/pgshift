import type { PgPool } from './pool'

/**
 * Ensures the pg_cron extension is installed.
 * Requires superuser or rds_superuser privileges.
 */
export async function ensurePgCron(pool: PgPool): Promise<void> {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pg_cron')
}

/**
 * Schedules a pg_cron job that inserts a payload into a PgShift queue.
 *
 * The job name must be unique within pg_cron.
 * If a job with the same name already exists, it is replaced.
 */
export async function scheduleQueueJob(
  pool: PgPool,
  jobName: string,
  cronExpr: string,
  queueTable: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // Remove existing job with the same name if it exists
  await pool
    .query(
      `SELECT cron.unschedule(jobid)
     FROM cron.job
     WHERE jobname = $1`,
      [jobName],
    )
    .catch(() => {}) // ignore if pg_cron table doesn't exist yet

  const sql = `INSERT INTO ${queueTable} (payload, status, run_at) VALUES ('${JSON.stringify(payload)}'::jsonb, 'pending', NOW())`

  await pool.query(`SELECT cron.schedule($1, $2, $3)`, [jobName, cronExpr, sql])
}

/**
 * Removes a scheduled pg_cron job by name.
 */
export async function unscheduleJob(
  pool: PgPool,
  jobName: string,
): Promise<void> {
  await pool.query(
    `SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = $1`,
    [jobName],
  )
}

/**
 * Lists all PgShift-managed cron jobs.
 * Identified by the 'pgshift:' prefix in jobname.
 */
export async function listJobs(pool: PgPool): Promise<CronJobInfo[]> {
  const rows = await pool.query<{
    jobname: string
    schedule: string
    active: boolean
    jobid: number
  }>(`
    SELECT jobname, schedule, active, jobid
    FROM cron.job
    WHERE jobname LIKE 'pgshift:%'
    ORDER BY jobname
  `)

  return rows.map((r) => ({
    name: r.jobname.replace('pgshift:', ''),
    schedule: r.schedule,
    active: r.active,
    jobId: r.jobid,
  }))
}

export interface CronJobInfo {
  name: string
  schedule: string
  active: boolean
  jobId: number
}

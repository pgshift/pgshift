import Docker from 'dockerode'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Client } from 'pg'

const CONTAINER_NAME = 'pgshift-test-postgres'
const IMAGE_NAME = 'pgshift-test-postgres'
const POSTGRES_PORT = 5499
const POSTGRES_PASSWORD = 'pgshift_test'
const POSTGRES_DB = 'pgshift_test'

export const TEST_DATABASE_URL = `postgres://postgres:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}`

let containerId: string | undefined

function createDockerClient(): Docker {
  if (process.env.DOCKER_HOST) {
    const host = process.env.DOCKER_HOST.replace(/^unix:\/\//, '')
    return new Docker({ socketPath: host })
  }

  const macSocket = join(homedir(), '.docker', 'run', 'docker.sock')
  if (existsSync(macSocket)) {
    return new Docker({ socketPath: macSocket })
  }

  const colimaSocket = join(homedir(), '.colima', 'default', 'docker.sock')
  if (existsSync(colimaSocket)) {
    return new Docker({ socketPath: colimaSocket })
  }

  return new Docker({ socketPath: '/var/run/docker.sock' })
}

export async function setup() {
  const docker = createDockerClient()

  // Remove existing container if it exists
  try {
    const existing = docker.getContainer(CONTAINER_NAME)
    await existing.stop().catch(() => {})
    await existing.remove().catch(() => {})
  } catch {}

  // Build the custom image if it doesn't exist
  await buildImageIfNeeded(docker)

  const container = await docker.createContainer({
    Image: IMAGE_NAME,
    name: CONTAINER_NAME,
    Env: [
      `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
      `POSTGRES_DB=${POSTGRES_DB}`,
    ],
    Cmd: [
      'postgres',
      '-c',
      'shared_preload_libraries=pg_cron',
      '-c',
      `cron.database_name=${POSTGRES_DB}`,
    ],
    HostConfig: {
      PortBindings: {
        '5432/tcp': [{ HostPort: String(POSTGRES_PORT) }],
      },
      AutoRemove: true,
    },
  })

  await container.start()
  containerId = container.id

  await waitForPostgres()
}

export async function teardown() {
  if (!containerId) return

  const docker = createDockerClient()
  try {
    const container = docker.getContainer(containerId)
    await container.stop()
  } catch {}
}

async function buildImageIfNeeded(docker: Docker): Promise<void> {
  try {
    await docker.getImage(IMAGE_NAME).inspect()
    return
  } catch {}

  console.log('[PgShift] Building test image with pgvector + pg_cron...')

  const testDir = existsSync(join(process.cwd(), 'Dockerfile'))
    ? process.cwd()
    : join(process.cwd(), '__tests__')

  await new Promise<void>((resolve, reject) => {
    docker.buildImage(
      { context: testDir, src: ['Dockerfile'] },
      { t: IMAGE_NAME },
      (err: Error | null, stream: NodeJS.ReadableStream | undefined) => {
        if (err) return reject(err)
        if (!stream) return reject(new Error('No build stream'))
        docker.modem.followProgress(stream, (err: Error | null) => {
          if (err) reject(err)
          else resolve()
        })
      },
    )
  })

  console.log('[PgShift] Test image built successfully.')
}

async function waitForPostgres(retries = 30, intervalMs = 500): Promise<void> {
  for (let i = 0; i < retries; i++) {
    const client = new Client({ connectionString: TEST_DATABASE_URL })
    try {
      await client.connect()
      await client.query('SELECT 1')
      await client.end()
      return
    } catch {
      await client.end().catch(() => {})
      await new Promise((r) => setTimeout(r, intervalMs))
    }
  }
  throw new Error('[PgShift] Postgres container did not become ready in time.')
}

import Docker from 'dockerode'
import { Client } from 'pg'

const CONTAINER_NAME = 'pgshift-test-postgres'
const POSTGRES_PORT = 5499
const POSTGRES_PASSWORD = 'pgshift_test'
const POSTGRES_DB = 'pgshift_test'

export const TEST_DATABASE_URL = `postgres://postgres:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}`

let containerId: string | undefined

export async function setup() {
  const docker = new Docker()

  // Remove existing container if it exists
  try {
    const existing = docker.getContainer(CONTAINER_NAME)
    await existing.stop().catch(() => {})
    await existing.remove().catch(() => {})
  } catch {}

  // Pull image if needed and start container
  await new Promise<void>((resolve, reject) => {
    docker.pull(
      'postgres:16-alpine',
      (err: Error, stream: NodeJS.ReadableStream) => {
        if (err) return resolve() // image already exists locally
        docker.modem.followProgress(stream, (err: Error | null) => {
          if (err) reject(err)
          else resolve()
        })
      },
    )
  })

  const container = await docker.createContainer({
    Image: 'postgres:16-alpine',
    name: CONTAINER_NAME,
    Env: [
      `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
      `POSTGRES_DB=${POSTGRES_DB}`,
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

  // Wait for Postgres to be ready
  await waitForPostgres()
}

export async function teardown() {
  if (!containerId) return

  const docker = new Docker()
  try {
    const container = docker.getContainer(containerId)
    await container.stop()
  } catch {}
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

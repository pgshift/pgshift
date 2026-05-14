import { createClient } from '@pgshift/workflow'

const DATABASE_URL =
  'postgres://postgres:pgshift_test@localhost:5499/pgshift_test'

const db = createClient({ url: DATABASE_URL })

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

const icons = {
  pending: '⏳',
  running: '⚡',
  completed: '✅',
  failed: '❌',
  compensated: '🧯',
}

function clearScreen() {
  console.clear()
}

function banner(title: string) {
  console.log(`
╔══════════════════════════════════════════════════════╗
║ ${title.padEnd(52)} ║
╚══════════════════════════════════════════════════════╝
`)
}

function logStep(step: string, message: string) {
  const time = new Date().toLocaleTimeString()

  console.log(` ${icons.running}  ${time}  ${step.padEnd(16)} ${message}`)
}

function renderStatus(status: any) {
  clearScreen()

  banner('PGShift Workflow Monitor')

  console.log(`Workflow : send-report`)
  console.log(`Run ID   : ${status.runId}`)
  console.log(`Status   : ${status.status}`)
  console.log(`Updated  : ${new Date().toLocaleTimeString()}`)

  console.log('\n')

  const rows = Object.entries(status.steps).map(([step, s]: any) => ({
    Step: step,
    Status: `${icons[s.status as keyof typeof icons] || '•'} ${s.status}`,
    Attempts: s.attempts ?? '-',
    Started: s.startedAt ? new Date(s.startedAt).toLocaleTimeString() : '-',
    Finished: s.finishedAt ? new Date(s.finishedAt).toLocaleTimeString() : '-',
  }))

  console.table(rows)

  const completed = rows.filter((r) => r.Status.includes('completed')).length

  const total = rows.length
  const progress = Math.round((completed / total) * 100)

  console.log(`\nProgress: ${progress}%`)
  console.log('─'.repeat(60))

  if (status.status === 'completed') {
    console.log('\n✅ Workflow completed successfully.\n')
  }

  if (status.status === 'failed') {
    console.log('\n❌ Workflow failed.\n')
  }

  if (status.status === 'compensated') {
    console.log('\n🧯 Workflow compensated.\n')
  }
}

// ---------------------------------------------------------------------------
// Define workflow
// ---------------------------------------------------------------------------

await db.workflow('send-report').define({
  steps: {
    fetch_data: {
      handler: 'fetchData',
      retries: 3,
    },

    generate_pdf: {
      handler: 'generatePdf',
      retries: 3,
      compensate: 'cleanupPdf',
    },

    upload_s3: {
      handler: 'uploadS3',
      retries: 3,
      compensate: 'deleteFromS3',
    },

    send_email: {
      handler: 'sendEmail',
      retries: 5,
    },

    log_audit: {
      handler: 'logAudit',
      retries: 5,
    },
  },

  dag: {
    fetch_data: [],
    generate_pdf: ['fetch_data'],
    upload_s3: ['generate_pdf'],
    send_email: ['upload_s3'],
    log_audit: ['upload_s3'],
  },
})

// ---------------------------------------------------------------------------
// Register handlers
// ---------------------------------------------------------------------------

await db.workflow('send-report').handlers({
  fetchData: async (ctx: any) => {
    logStep(ctx.step, 'Fetching report data...')
    await sleep(1000)

    return {
      records: 1234,
      period: 'Q1 2025',
    }
  },

  generatePdf: async (ctx: any) => {
    const { records } = ctx.previousSteps['fetch_data'] as {
      records: number
    }

    logStep(ctx.step, `Generating PDF for ${records} records...`)

    await sleep(1500)

    return {
      pdfPath: '/tmp/report-q1-2025.pdf',
      sizeKb: 420,
    }
  },

  cleanupPdf: async (ctx: any) => {
    logStep(ctx.step, 'Compensating: deleting generated PDF...')
  },

  uploadS3: async (ctx: any) => {
    const { pdfPath } = ctx.previousSteps['generate_pdf'] as {
      pdfPath: string
    }

    logStep(ctx.step, `Uploading ${pdfPath} to S3...`)

    await sleep(2000)

    return {
      s3Url: 'https://s3.example.com/reports/q1-2025.pdf',
    }
  },

  deleteFromS3: async (ctx: any) => {
    logStep(ctx.step, 'Compensating: deleting file from S3...')
  },

  sendEmail: async (ctx: any) => {
    const { s3Url } = ctx.previousSteps['upload_s3'] as {
      s3Url: string
    }

    logStep(ctx.step, `Sending email with link: ${s3Url}`)

    await sleep(1000)
  },

  logAudit: async (ctx: any) => {
    logStep(ctx.step, `Writing audit log for run ${ctx.runId}`)

    await sleep(500)
  },
})

// ---------------------------------------------------------------------------
// Start worker
// ---------------------------------------------------------------------------

clearScreen()
banner('Starting Worker')

await db.workflow('send-report').work()

console.log('🚀 Worker started.\n')

// ---------------------------------------------------------------------------
// Trigger workflow
// ---------------------------------------------------------------------------

const runId = await db.workflow('send-report').run({
  requestedBy: 'user@example.com',
  reportType: 'quarterly',
})

console.log(`▶️  Run started: ${runId}`)

// ---------------------------------------------------------------------------
// Poll workflow status
// ---------------------------------------------------------------------------

await waitForCompletion(db, runId)

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down...')
  await db.destroy()
  process.exit(0)
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForCompletion(
  db: ReturnType<typeof createClient>,
  runId: string,
): Promise<void> {
  while (true) {
    await sleep(500)

    const status = await db.workflow('send-report').status(runId)

    renderStatus(status)

    if (['completed', 'failed', 'compensated'].includes(status.status)) {
      break
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

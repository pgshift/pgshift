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
  compensating: '🧯',
  compensated: '↩️',
  skipped: '➖',
}

const colors = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function clearScreen() {
  console.clear()
}

function banner(title: string) {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║ ${title.padEnd(58)} ║
╚════════════════════════════════════════════════════════════╝
`)
}

function logStep(
  step: string,
  message: string,
  type: 'info' | 'success' | 'error' | 'compensate' = 'info',
) {
  const time = new Date().toLocaleTimeString()

  const color =
    type === 'success'
      ? colors.green
      : type === 'error'
        ? colors.red
        : type === 'compensate'
          ? colors.yellow
          : colors.cyan

  console.log(
    `${color}${icons.running} ${time} ${step.padEnd(
      22,
    )}${message}${colors.reset}`,
  )
}

function renderStatus(status: any) {
  clearScreen()

  banner('PGShift Order Fulfillment')

  console.log(`Workflow : order-fulfillment`)
  console.log(`Run ID   : ${status.runId}`)
  console.log(`Status   : ${status.status}`)
  console.log(`Updated  : ${new Date().toLocaleTimeString()}`)

  console.log('\n')

  const rows = Object.entries(status.steps).map(([step, s]: any) => ({
    Step: step,
    Status: `${icons[s.status as keyof typeof icons] ?? '•'} ${s.status}`,
    Attempts: s.attempts ?? '-',
    Error: s.error ? String(s.error).slice(0, 50) : '-',
  }))

  console.table(rows)

  const completed = rows.filter((r) => r.Status.includes('completed')).length

  const total = rows.length
  const progress = Math.round((completed / total) * 100)

  const progressBar =
    '█'.repeat(Math.floor(progress / 10)) +
    '░'.repeat(10 - Math.floor(progress / 10))

  console.log(`Progress: [${progressBar}] ${progress}%`)

  console.log('\nExecution Graph:\n')

  console.log(`
 validate_stock ─┐
                 ├─→ charge_card → emit_invoice ─┬─→ send_email
 validate_fraud ─┘                               └─→ update_analytics
`)

  if (status.status === 'completed') {
    console.log(
      `${colors.green}✅ Workflow completed successfully.${colors.reset}\n`,
    )
  }

  if (status.status === 'failed') {
    console.log(`${colors.red}❌ Workflow failed.${colors.reset}\n`)
  }

  if (status.status === 'compensated') {
    console.log(`${colors.yellow}🧯 Workflow compensated.${colors.reset}\n`)
  }
}

// ---------------------------------------------------------------------------
// Define
// ---------------------------------------------------------------------------

await db.workflow('order-fulfillment').define({
  steps: {
    validate_stock: {
      handler: 'validateStock',
      retries: 3,
    },

    validate_fraud: {
      handler: 'validateFraud',
      retries: 3,
    },

    charge_card: {
      handler: 'chargeCard',
      retries: 1,
      compensate: 'refundCard',
    },

    emit_invoice: {
      handler: 'emitInvoice',
      retries: 3,
      compensate: 'voidInvoice',
    },

    send_email: {
      handler: 'sendEmail',
      retries: 5,
    },

    update_analytics: {
      handler: 'updateAnalytics',
      retries: 5,
    },
  },

  dag: {
    validate_stock: [],
    validate_fraud: [],
    charge_card: ['validate_stock', 'validate_fraud'],
    emit_invoice: ['charge_card'],
    send_email: ['emit_invoice'],
    update_analytics: ['emit_invoice'],
  },
})

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

await db.workflow('order-fulfillment').handlers({
  validateStock: async (ctx: any) => {
    const { orderId, items } = ctx.input as {
      orderId: string
      items: string[]
    }

    logStep(ctx.step, `Validating stock for ${orderId}...`)

    await sleep(1000)

    const outOfStock = items.filter((item) => item === 'ITEM_SOLD_OUT')

    if (outOfStock.length > 0) {
      throw new Error(`Items out of stock: ${outOfStock.join(', ')}`)
    }

    return {
      available: true,
      reservationId: `res_${Date.now()}`,
    }
  },

  validateFraud: async (ctx: any) => {
    const { customerId, amount } = ctx.input as {
      customerId: string
      amount: number
    }

    logStep(ctx.step, `Running fraud check for ${customerId}...`)

    await sleep(1200)

    if (amount > 50_000) {
      throw new Error(`Manual fraud review required`)
    }

    return {
      riskScore: 0.02,
      approved: true,
    }
  },

  chargeCard: async (ctx: any) => {
    const { amount, paymentMethod } = ctx.input as {
      amount: number
      paymentMethod: string
    }

    logStep(ctx.step, `Charging $${amount} via ${paymentMethod}...`)

    await sleep(2000)

    return {
      chargeId: `ch_${Date.now()}`,
      amount,
      chargedAt: new Date().toISOString(),
    }
  },

  refundCard: async (ctx: any) => {
    const charge = ctx.previousSteps['charge_card'] as {
      chargeId: string
      amount: number
    }

    logStep(ctx.step, `COMPENSATING refund ${charge.chargeId}`, 'compensate')

    await sleep(1200)
  },

  emitInvoice: async (ctx: any) => {
    const { orderId } = ctx.input as {
      orderId: string
    }

    logStep(ctx.step, `Generating invoice for ${orderId}...`)

    await sleep(1000)

    return {
      invoiceId: `inv_${Date.now()}`,
    }
  },

  voidInvoice: async (ctx: any) => {
    logStep(ctx.step, 'Voiding invoice...', 'compensate')

    await sleep(800)
  },

  sendEmail: async (ctx: any) => {
    const { customerId } = ctx.input as {
      customerId: string
    }

    logStep(ctx.step, `Sending confirmation email to ${customerId}...`)

    await sleep(1000)

    return {
      sent: true,
    }
  },

  updateAnalytics: async (ctx: any) => {
    const charge = ctx.previousSteps['charge_card'] as {
      amount: number
    }

    logStep(ctx.step, `Recording analytics revenue=$${charge.amount}`)

    await sleep(600)

    return {
      recorded: true,
    }
  },
})

// ---------------------------------------------------------------------------
// Start worker
// ---------------------------------------------------------------------------

clearScreen()
banner('Starting Worker')

await db.workflow('order-fulfillment').work()

console.log('🚀 Worker started.\n')

// ---------------------------------------------------------------------------
// Trigger run
// ---------------------------------------------------------------------------

const runId = await db.workflow('order-fulfillment').run({
  orderId: 'order-7823',
  customerId: 'cust-456',
  amount: 299.99,
  paymentMethod: 'card_4242',
  items: ['NIKE_AIR_MAX', 'ADIDAS_ULTRABOOST'],
})

console.log(`▶️  Run started: ${runId}`)

// ---------------------------------------------------------------------------
// Wait
// ---------------------------------------------------------------------------

await waitForCompletion(db, runId)

// ---------------------------------------------------------------------------
// Shutdown
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

    const status = await db.workflow('order-fulfillment').status(runId)

    renderStatus(status)

    if (['completed', 'failed', 'compensated'].includes(status.status)) {
      break
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

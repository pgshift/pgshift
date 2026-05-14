import { createPostgresWorkflowAdapter } from '@pgshift/adapter-workflow-postgres'
import type {
  MigrationHint,
  PgShiftConfig,
  WorkflowAdapter,
  WorkflowDefinition,
  WorkflowRunStatus,
} from '@pgshift/core'
import { PgShiftClient } from '@pgshift/core'

export type { WorkflowContext, WorkflowStepConfig } from '@pgshift/adapter-workflow-postgres'
export type { WorkflowDefinition, WorkflowRunStatus } from '@pgshift/core'

export interface CreateWorkflowClientOptions {
  url: string
  max?: number
  ssl?: boolean | { rejectUnauthorized: boolean }
  metrics?: boolean
  onMigrationHint?: (hint: MigrationHint) => void
}

/**
 * Creates a PgShift client with workflow orchestration backed by PostgreSQL.
 *
 * Supports DAG-based workflows with parallel steps, automatic retries,
 * and saga-pattern compensation when a step fails irrecoverably.
 *
 * @example
 * ```ts
 * import { createClient } from '@pgshift/workflow'
 *
 * const db = createClient({ url: process.env.DATABASE_URL })
 *
 * await db.workflow('order-fulfillment').define({
 *   steps: {
 *     validate_stock:   { handler: 'validateStock',  retries: 3 },
 *     validate_fraud:   { handler: 'validateFraud',  retries: 3 },
 *     charge_card:      { handler: 'chargeCard',     retries: 1, compensate: 'refundCard' },
 *     emit_invoice:     { handler: 'emitInvoice',    retries: 3, compensate: 'voidInvoice' },
 *     send_email:       { handler: 'sendEmail',      retries: 5 },
 *     update_analytics: { handler: 'updateAnalytics',retries: 5 },
 *   },
 *   dag: {
 *     validate_stock:   [],
 *     validate_fraud:   [],
 *     charge_card:      ['validate_stock', 'validate_fraud'],
 *     emit_invoice:     ['charge_card'],
 *     send_email:       ['emit_invoice'],
 *     update_analytics: ['emit_invoice'],
 *   },
 * })
 *
 * await db.workflow('order-fulfillment').handlers({
 *   validateStock:   async (ctx) => { ... },
 *   validateFraud:   async (ctx) => { ... },
 *   chargeCard:      async (ctx) => { ... },
 *   refundCard:      async (ctx) => { ... },
 *   emitInvoice:     async (ctx) => { ... },
 *   voidInvoice:     async (ctx) => { ... },
 *   sendEmail:       async (ctx) => { ... },
 *   updateAnalytics: async (ctx) => { ... },
 * })
 *
 * const runId = await db.workflow('order-fulfillment').run({
 *   orderId: 'order-123',
 *   amount: 299.99,
 * })
 *
 * await db.workflow('order-fulfillment').work()
 *
 * const status = await db.workflow('order-fulfillment').status(runId)
 * ```
 */
export function createClient(options: CreateWorkflowClientOptions): PgShiftClient & {
  workflow: (name: string) => WorkflowHandle
} {
  const config: PgShiftConfig = {
    url: options.url,
    max: options.max,
    ssl: options.ssl,
  }

  const adapter = createPostgresWorkflowAdapter(config)
  const handles = new Map<string, WorkflowHandle>()

  const client = new PgShiftClient({
    config,
    metrics: options.metrics,
    onMigrationHint: options.onMigrationHint,
    adapters: {},
  }) as PgShiftClient & { workflow: (name: string) => WorkflowHandle }

  client.workflow = (name: string): WorkflowHandle => {
    if (!handles.has(name)) {
      handles.set(name, new WorkflowHandle(name, adapter))
    }
    return handles.get(name)!
  }

  const originalDestroy = client.destroy.bind(client)
  client.destroy = async () => {
    await originalDestroy()
    await adapter.teardown?.()
  }

  return client
}

// ---------------------------------------------------------------------------
// WorkflowHandle — fluent API per workflow name
// ---------------------------------------------------------------------------

class WorkflowHandle {
  constructor(
    private readonly name: string,
    private readonly adapter: WorkflowAdapter,
  ) {}

  async define(definition: WorkflowDefinition): Promise<WorkflowHandle> {
    await this.adapter.define(this.name, definition)
    return this
  }

  async handlers(
    handlers: Record<string, (ctx: unknown) => Promise<unknown>>,
  ): Promise<WorkflowHandle> {
    await this.adapter.handlers(this.name, handlers)
    return this
  }

  async run(input: Record<string, unknown> = {}): Promise<string> {
    return this.adapter.run(this.name, input)
  }

  async status(runId: string): Promise<WorkflowRunStatus> {
    return this.adapter.status(runId)
  }

  async work(): Promise<void> {
    return this.adapter.work(this.name)
  }
}

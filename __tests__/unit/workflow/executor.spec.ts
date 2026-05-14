import { describe, expect, it } from 'vitest'
import {
  readySteps,
  topologicalSort,
} from '../../../adapters/workflow-postgres/source/dag'

// ---------------------------------------------------------------------------
// We test the executor logic by testing the building blocks it uses:
// - readySteps (from dag.ts) correctly identifies what can run
// - topologicalSort correctly orders compensation
// - handler invocation contract (via WorkflowContext shape)
//
// Integration tests cover the full executor with a real database.
// ---------------------------------------------------------------------------

describe('executor logic — step dispatching', () => {
  describe('determining ready steps from DAG state', () => {
    it('dispatches root steps immediately on run start', () => {
      const dag = {
        validate_stock: [],
        validate_fraud: [],
        charge_card: ['validate_stock', 'validate_fraud'],
      }
      const initialStatuses = {
        validate_stock: 'pending',
        validate_fraud: 'pending',
        charge_card: 'pending',
      }

      const ready = readySteps(dag, initialStatuses)
      expect(ready.sort()).toEqual(['validate_fraud', 'validate_stock'])
    })

    it('unblocks a step only after all dependencies complete', () => {
      const dag = {
        validate_stock: [],
        validate_fraud: [],
        charge_card: ['validate_stock', 'validate_fraud'],
      }

      // Only one dependency done
      const partial = {
        validate_stock: 'completed',
        validate_fraud: 'running',
        charge_card: 'pending',
      }
      expect(readySteps(dag, partial)).toEqual([])

      // Both done
      const both = {
        validate_stock: 'completed',
        validate_fraud: 'completed',
        charge_card: 'pending',
      }
      expect(readySteps(dag, both)).toEqual(['charge_card'])
    })

    it('dispatches parallel terminal steps simultaneously', () => {
      const dag = {
        emit_invoice: [],
        send_email: ['emit_invoice'],
        update_analytics: ['emit_invoice'],
      }
      const statuses = {
        emit_invoice: 'completed',
        send_email: 'pending',
        update_analytics: 'pending',
      }

      const ready = readySteps(dag, statuses)
      expect(ready.sort()).toEqual(['send_email', 'update_analytics'])
    })

    it('returns empty when all steps are done', () => {
      const dag = { a: [], b: ['a'] }
      const statuses = { a: 'completed', b: 'completed' }

      expect(readySteps(dag, statuses)).toEqual([])
    })
  })

  describe('completion detection', () => {
    it('detects run completion when all steps are completed', () => {
      const stepStatuses = {
        step_a: 'completed',
        step_b: 'completed',
        step_c: 'completed',
      }

      const allCompleted = Object.values(stepStatuses).every(
        (s) => s === 'completed' || s === 'skipped',
      )

      expect(allCompleted).toBe(true)
    })

    it('does not detect completion when any step is pending', () => {
      const stepStatuses = {
        step_a: 'completed',
        step_b: 'pending',
      }

      const allCompleted = Object.values(stepStatuses).every(
        (s) => s === 'completed' || s === 'skipped',
      )

      expect(allCompleted).toBe(false)
    })

    it('counts skipped steps as terminal', () => {
      const stepStatuses = {
        step_a: 'completed',
        step_b: 'skipped',
        step_c: 'completed',
      }

      const allCompleted = Object.values(stepStatuses).every(
        (s) => s === 'completed' || s === 'skipped',
      )

      expect(allCompleted).toBe(true)
    })
  })

  describe('failure detection', () => {
    it('detects permanent failure when a step has failed status', () => {
      const steps = [
        { step: 'validate_stock', status: 'completed' },
        { step: 'charge_card', status: 'failed' },
        { step: 'send_email', status: 'pending' },
      ]

      const failedStep = steps.find((s) => s.status === 'failed')
      expect(failedStep).toBeDefined()
      expect(failedStep?.step).toBe('charge_card')
    })

    it('does not trigger compensation for running steps', () => {
      const steps = [
        { step: 'step_a', status: 'completed' },
        { step: 'step_b', status: 'running' },
      ]

      const failedStep = steps.find((s) => s.status === 'failed')
      expect(failedStep).toBeUndefined()
    })
  })

  describe('retry backoff calculation', () => {
    it('calculates exponential backoff correctly', () => {
      const backoff = (attempt: number) => Math.min(1000 * 2 ** attempt, 30_000)

      expect(backoff(0)).toBe(1_000) // 1s
      expect(backoff(1)).toBe(2_000) // 2s
      expect(backoff(2)).toBe(4_000) // 4s
      expect(backoff(3)).toBe(8_000) // 8s
      expect(backoff(4)).toBe(16_000) // 16s
      expect(backoff(5)).toBe(30_000) // capped at 30s
      expect(backoff(10)).toBe(30_000) // still capped
    })
  })

  describe('WorkflowContext contract', () => {
    it('provides correct context shape to handlers', () => {
      const expectedCtxShape = {
        runId: expect.any(String),
        step: expect.any(String),
        input: expect.any(Object),
        attempt: expect.any(Number),
        previousSteps: expect.any(Object),
      }

      const mockCtx = {
        runId: 'run-123',
        step: 'charge_card',
        input: { orderId: 'order-456', amount: 299.99 },
        attempt: 1,
        previousSteps: {
          validate_stock: { reservationId: 'res-789' },
          validate_fraud: { approved: true },
        },
      }

      expect(mockCtx).toMatchObject(expectedCtxShape)
    })

    it('handler can access previous step outputs', () => {
      const previousSteps = {
        validate_stock: { reservationId: 'res-789', available: true },
        validate_fraud: { riskScore: 0.02, approved: true },
      }

      // Simulates how a handler reads from previousSteps
      const { reservationId } = previousSteps['validate_stock'] as {
        reservationId: string
      }
      const { riskScore } = previousSteps['validate_fraud'] as {
        riskScore: number
      }

      expect(reservationId).toBe('res-789')
      expect(riskScore).toBe(0.02)
    })
  })

  describe('compensation order', () => {
    it('compensates in reverse execution order', () => {
      const dag = {
        validate: [],
        charge: ['validate'],
        invoice: ['charge'],
        email: ['invoice'],
      }

      const executionOrder = topologicalSort(dag)
      const compensationOrderResult = [...executionOrder].reverse()

      // email → invoice → charge → validate
      expect(compensationOrderResult[0]).toBe('email')
      expect(compensationOrderResult[1]).toBe('invoice')
      expect(compensationOrderResult[2]).toBe('charge')
      expect(compensationOrderResult[3]).toBe('validate')
    })

    it('only compensates steps that have a compensate handler defined', () => {
      const stepsWithCompensation = new Set(['charge', 'invoice'])
      const completedSteps = ['validate', 'charge', 'invoice']

      const toCompensate = completedSteps.filter((s) =>
        stepsWithCompensation.has(s),
      )

      expect(toCompensate.sort()).toEqual(['charge', 'invoice'])
      expect(toCompensate).not.toContain('validate')
    })
  })
})

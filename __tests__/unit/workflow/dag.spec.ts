import { describe, expect, it } from 'vitest'
import {
  compensationOrder,
  readySteps,
  topologicalSort,
  validateDag,
} from '../../../adapters/workflow-postgres/source/dag'

describe('readySteps', () => {
  it('returns steps with no dependencies when all are pending', () => {
    const dag = {
      fetch_data: [],
      validate: [],
      process_data: ['fetch_data', 'validate'],
    }
    const statuses = {
      fetch_data: 'pending',
      validate: 'pending',
      process_data: 'pending',
    }

    expect(readySteps(dag, statuses).sort()).toEqual(['fetch_data', 'validate'])
  })

  it('returns a step when all its dependencies are completed', () => {
    const dag = {
      fetch_data: [],
      process_data: ['fetch_data'],
      send_email: ['process_data'],
    }
    const statuses = {
      fetch_data: 'completed',
      process_data: 'pending',
      send_email: 'pending',
    }

    expect(readySteps(dag, statuses)).toEqual(['process_data'])
  })

  it('does not return a step if any dependency is not completed', () => {
    const dag = {
      step_a: [],
      step_b: [],
      step_c: ['step_a', 'step_b'],
    }
    const statuses = {
      step_a: 'completed',
      step_b: 'running',
      step_c: 'pending',
    }

    expect(readySteps(dag, statuses)).toEqual([])
  })

  it('does not return steps that are already running or completed', () => {
    const dag = {
      step_a: [],
      step_b: ['step_a'],
    }
    const statuses = {
      step_a: 'running',
      step_b: 'pending',
    }

    expect(readySteps(dag, statuses)).toEqual([])
  })

  it('returns multiple independent steps in parallel', () => {
    const dag = {
      step_a: [],
      step_b: [],
      step_c: [],
      step_d: ['step_a', 'step_b', 'step_c'],
    }
    const statuses = {
      step_a: 'pending',
      step_b: 'pending',
      step_c: 'pending',
      step_d: 'pending',
    }

    expect(readySteps(dag, statuses).sort()).toEqual([
      'step_a',
      'step_b',
      'step_c',
    ])
  })

  it('returns empty when all steps are completed', () => {
    const dag = { step_a: [], step_b: ['step_a'] }
    const statuses = { step_a: 'completed', step_b: 'completed' }

    expect(readySteps(dag, statuses)).toEqual([])
  })

  it('handles a complex DAG correctly', () => {
    const dag = {
      validate_stock: [],
      validate_fraud: [],
      charge_card: ['validate_stock', 'validate_fraud'],
      emit_invoice: ['charge_card'],
      send_email: ['emit_invoice'],
      update_analytics: ['emit_invoice'],
    }

    // After validate_stock and validate_fraud complete
    const statuses = {
      validate_stock: 'completed',
      validate_fraud: 'completed',
      charge_card: 'pending',
      emit_invoice: 'pending',
      send_email: 'pending',
      update_analytics: 'pending',
    }

    expect(readySteps(dag, statuses)).toEqual(['charge_card'])
  })
})

describe('topologicalSort', () => {
  it('returns a valid topological order', () => {
    const dag = {
      a: [],
      b: ['a'],
      c: ['a'],
      d: ['b', 'c'],
    }

    const sorted = topologicalSort(dag)

    // a must come before b, c, d
    // b and c must come before d
    expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'))
    expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('c'))
    expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('d'))
    expect(sorted.indexOf('c')).toBeLessThan(sorted.indexOf('d'))
  })

  it('handles a linear chain', () => {
    const dag = { a: [], b: ['a'], c: ['b'], d: ['c'] }
    const sorted = topologicalSort(dag)

    expect(sorted).toEqual(['a', 'b', 'c', 'd'])
  })

  it('includes all steps', () => {
    const dag = { a: [], b: [], c: ['a', 'b'] }
    const sorted = topologicalSort(dag)

    expect(sorted.sort()).toEqual(['a', 'b', 'c'])
  })

  it('throws on a cycle', () => {
    const dag = { a: ['c'], b: ['a'], c: ['b'] }

    expect(() => topologicalSort(dag)).toThrow('cycle')
  })

  it('handles a single step', () => {
    expect(topologicalSort({ a: [] })).toEqual(['a'])
  })
})

describe('validateDag', () => {
  it('passes for a valid DAG', () => {
    const dag = {
      a: [],
      b: ['a'],
      c: ['a', 'b'],
    }

    expect(() => validateDag(dag)).not.toThrow()
  })

  it('throws when a dependency is not declared', () => {
    const dag = { a: ['nonexistent'] }

    expect(() => validateDag(dag)).toThrow('"nonexistent"')
  })

  it('throws on a cycle', () => {
    const dag = { a: ['b'], b: ['a'] }

    expect(() => validateDag(dag)).toThrow('cycle')
  })

  it('passes for independent parallel steps', () => {
    const dag = { a: [], b: [], c: [], d: ['a', 'b', 'c'] }

    expect(() => validateDag(dag)).not.toThrow()
  })
})

describe('compensationOrder', () => {
  it('returns completed steps with compensation in reverse topological order', () => {
    const dag = {
      validate: [],
      charge: ['validate'],
      invoice: ['charge'],
      email: ['invoice'],
    }

    const completedSteps = ['validate', 'charge', 'invoice']
    const stepsWithCompensation = new Set(['charge', 'invoice'])

    const order = compensationOrder(dag, completedSteps, stepsWithCompensation)

    // invoice was completed after charge, so it should be compensated first
    expect(order.indexOf('invoice')).toBeLessThan(order.indexOf('charge'))
    expect(order).not.toContain('validate') // no compensation defined
    expect(order).not.toContain('email') // not completed
  })

  it('returns empty when no completed steps have compensation', () => {
    const dag = { a: [], b: ['a'] }
    const order = compensationOrder(dag, ['a', 'b'], new Set())

    expect(order).toEqual([])
  })

  it('returns empty when no steps are completed', () => {
    const dag = { a: [], b: ['a'] }
    const order = compensationOrder(dag, [], new Set(['a', 'b']))

    expect(order).toEqual([])
  })

  it('handles parallel steps in compensation', () => {
    const dag = {
      start: [],
      parallel_a: ['start'],
      parallel_b: ['start'],
      finish: ['parallel_a', 'parallel_b'],
    }

    const completedSteps = ['start', 'parallel_a', 'parallel_b', 'finish']
    const stepsWithCompensation = new Set([
      'parallel_a',
      'parallel_b',
      'finish',
    ])

    const order = compensationOrder(dag, completedSteps, stepsWithCompensation)

    // finish must be compensated before parallel_a and parallel_b
    expect(order.indexOf('finish')).toBeLessThan(order.indexOf('parallel_a'))
    expect(order.indexOf('finish')).toBeLessThan(order.indexOf('parallel_b'))
  })
})

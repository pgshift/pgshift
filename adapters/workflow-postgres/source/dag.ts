/**
 * DAG utilities for workflow step resolution.
 *
 * The DAG is stored as an adjacency list:
 *   { step: [dependency1, dependency2] }
 *
 * A step is "ready" when all its dependencies have status = 'completed'.
 */

export type DagConfig = Record<string, string[]>

/**
 * Returns the list of steps that are ready to run given the current
 * status of all steps in a run.
 *
 * A step is ready when:
 * - Its status is 'pending'
 * - All its dependencies are 'completed'
 */
export function readySteps(
  dag: DagConfig,
  stepStatuses: Record<string, string>,
): string[] {
  return Object.entries(dag)
    .filter(([step, deps]) => {
      if (stepStatuses[step] !== 'pending') return false
      return deps.every((dep) => stepStatuses[dep] === 'completed')
    })
    .map(([step]) => step)
}

/**
 * Returns a topologically sorted list of all steps.
 * Used to determine compensation order (reverse of execution order).
 *
 * Throws if the DAG has a cycle.
 */
export function topologicalSort(dag: DagConfig): string[] {
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const result: string[] = []

  function visit(step: string): void {
    if (visited.has(step)) return
    if (visiting.has(step)) {
      throw new Error(
        `[PgShift] Workflow DAG has a cycle involving step "${step}".`,
      )
    }

    visiting.add(step)

    for (const dep of dag[step] ?? []) {
      visit(dep)
    }

    visiting.delete(step)
    visited.add(step)
    result.push(step)
  }

  for (const step of Object.keys(dag)) {
    visit(step)
  }

  return result
}

/**
 * Validates the DAG config:
 * - All dependency references point to declared steps
 * - No cycles
 */
export function validateDag(dag: DagConfig): void {
  const steps = new Set(Object.keys(dag))

  for (const [step, deps] of Object.entries(dag)) {
    for (const dep of deps) {
      if (!steps.has(dep)) {
        throw new Error(
          `[PgShift] Workflow DAG: step "${step}" depends on "${dep}", which is not declared.`,
        )
      }
    }
  }

  topologicalSort(dag) // throws if cycle exists
}

/**
 * Returns the compensation order for completed steps.
 * This is the reverse of the topological sort, filtered to
 * steps that are completed and have a compensate handler.
 */
export function compensationOrder(
  dag: DagConfig,
  completedSteps: string[],
  stepsWithCompensation: Set<string>,
): string[] {
  const sorted = topologicalSort(dag)
  return sorted
    .filter(
      (step) =>
        completedSteps.includes(step) && stepsWithCompensation.has(step),
    )
    .reverse()
}

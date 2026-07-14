import type {
  EntityId,
  PlanExercise,
  WorkoutSession,
} from '../../domain/entities'
import { forgeDatabase } from '../database'
import { EntityRepository } from './entity-repository'

class PlanExerciseRepository extends EntityRepository<PlanExercise> {
  async listByPlan(planId: EntityId) {
    const exercises = await forgeDatabase.planExercises
      .where('planId')
      .equals(planId)
      .sortBy('position')

    return exercises.filter((exercise) => !exercise.deletedAt)
  }
}

class WorkoutSessionRepository extends EntityRepository<WorkoutSession> {
  async getActive() {
    const active = await forgeDatabase.workoutSessions
      .where('status')
      .anyOf(['draft', 'active', 'paused'])
      .toArray()

    return active.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    )[0]
  }
}

export const forgeRepositories = {
  exercises: new EntityRepository(forgeDatabase.exercises),
  trainingPlans: new EntityRepository(forgeDatabase.trainingPlans),
  planExercises: new PlanExerciseRepository(forgeDatabase.planExercises),
  workoutSessions: new WorkoutSessionRepository(forgeDatabase.workoutSessions),
  statisticsCaches: forgeDatabase.statisticsCaches,
  settings: forgeDatabase.settings,
}

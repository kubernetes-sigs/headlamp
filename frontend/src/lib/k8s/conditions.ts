/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { KubeCondition } from './cluster';

/**
 * The part of a status condition these helpers rely on. Kept structural so it
 * accepts both {@link KubeCondition} and the looser condition types custom
 * resources declare for themselves.
 */
export type ConditionLike = Pick<KubeCondition, 'type' | 'status'>;

/**
 * Whether the given conditions report `type` as met.
 *
 * A condition is met only when it is present with status `'True'`; both
 * `'False'` and `'Unknown'` count as not met, as does a missing condition.
 */
export function isConditionTrue(
  conditions: ConditionLike[] | undefined | null,
  type: string
): boolean {
  return !!conditions?.some(condition => condition.type === type && condition.status === 'True');
}

/**
 * Picks the single most meaningful met condition to show in a list column.
 *
 * A resource can report several conditions as met at once, and their order in
 * `status.conditions` is not guaranteed, so showing the first one makes the
 * column flicker between equally true values. `priority` lists condition types
 * most significant first, and the earliest match in it wins; a met condition
 * absent from `priority` is only used when nothing in `priority` matches.
 *
 * Returns `undefined` when no condition is met, leaving the display fallback to
 * the caller.
 */
export function getTopCondition(
  conditions: ConditionLike[] | undefined | null,
  priority: readonly string[]
): string | undefined {
  const metConditions = conditions?.filter(condition => condition.status === 'True');
  if (!metConditions?.length) {
    return undefined;
  }

  let selected = metConditions[0];
  let bestPriorityIndex = priority.length;

  for (const condition of metConditions) {
    const index = priority.indexOf(condition.type);
    if (index !== -1 && index < bestPriorityIndex) {
      bestPriorityIndex = index;
      selected = condition;
    }
  }

  return selected.type;
}

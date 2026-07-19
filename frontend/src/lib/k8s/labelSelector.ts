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

import type { LabelSelector } from './cluster';

type MatchExpression = NonNullable<LabelSelector['matchExpressions']>[number];

function matchesExpression(labels: Record<string, string>, req: MatchExpression): boolean {
  const present = Object.prototype.hasOwnProperty.call(labels, req.key);
  const values = req.values ?? [];

  switch (req.operator) {
    case 'In':
      return present && values.includes(labels[req.key]);
    case 'NotIn':
      // A missing key satisfies NotIn, matching the API server's set-based semantics.
      return !present || !values.includes(labels[req.key]);
    case 'Exists':
      return present;
    case 'DoesNotExist':
      return !present;
    default:
      // Unknown operator: fail closed rather than silently matching.
      return false;
  }
}

/**
 * Evaluates a Kubernetes label selector against a set of labels on the client,
 * with the same semantics the API server uses for `matchLabels` and
 * `matchExpressions`.
 *
 * An empty or absent selector (no `matchLabels` and no `matchExpressions`)
 * matches everything, as Kubernetes does. Callers that need the
 * context-specific meaning of an absent selector (for example a NetworkPolicy
 * peer where `null` and `{}` differ) should handle that before calling.
 *
 * @param labels - the labels to test, for example a Pod's `metadata.labels`.
 * @param selector - the selector to evaluate.
 * @returns whether the labels satisfy the selector.
 */
export function matchesLabelSelector(
  labels: Record<string, string> | undefined,
  selector: LabelSelector | undefined
): boolean {
  const { matchLabels, matchExpressions } = selector ?? {};

  const hasCriteria =
    (matchLabels && Object.keys(matchLabels).length > 0) ||
    (matchExpressions && matchExpressions.length > 0);
  if (!hasCriteria) {
    return true;
  }

  const target = labels ?? {};

  if (matchLabels) {
    for (const [key, value] of Object.entries(matchLabels)) {
      if (target[key] !== value) {
        return false;
      }
    }
  }

  if (matchExpressions) {
    for (const req of matchExpressions) {
      if (!matchesExpression(target, req)) {
        return false;
      }
    }
  }

  return true;
}

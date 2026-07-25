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

import _ from 'lodash';
import React from 'react';
import { labelMapsEqual } from './CreateResourceForm';

/** Options for {@link useSelectorPodTemplate}. */
export interface UseSelectorPodTemplateOptions<T extends Record<string, any>> {
  /** Current resource draft. */
  resource: T;
  /** Called when the resource is updated (defaults seeded, selector edited). */
  onChange: (resource: T) => void;
  /** Value seeded into `spec.replicas` when unset on first mount. Defaults
   *  to `1`. Pass `null` to skip seeding replicas (useful for DaemonSet,
   *  Job, etc. which don't take a replica count). */
  defaultReplicas?: number | null;
}

const DEFAULT_MATCH_LABELS: Record<string, string> = { app: 'headlamp' };

/** Returned by {@link useSelectorPodTemplate}. */
export interface SelectorPodTemplateState {
  /** Current `spec.selector.matchLabels`. */
  matchLabels: Record<string, string>;
  /** Current `spec.template.metadata.labels`. */
  podLabels: Record<string, string>;
  /** Apply a new selector map. Old selector entries are replaced with
   *  `nextMatch`; any pod-template-only extras are preserved. Selector wins
   *  on key collision, matching {@link PodLabelsEditor}. */
  handleMatchLabelsChange: (nextMatch: Record<string, string>) => void;
}

/** Shared selector + pod-template wiring for resources that embed a pod
 *  template (Deployment, ReplicaSet, StatefulSet, DaemonSet, Job, ...).
 *  Seeds defaults once on mount and exposes a selector change handler that
 *  mirrors selector entries into the pod template labels.
 *
 *  Opt-in: only call this from forms that actually have a selector + pod
 *  template. Pair with {@link LabelTextField} for the selector field and
 *  {@link PodLabelsEditor} for the pod template labels field, both via the
 *  `render` callback on a {@link FormField}. */
export function useSelectorPodTemplate<T extends Record<string, any>>(
  opts: UseSelectorPodTemplateOptions<T>
): SelectorPodTemplateState {
  const { resource, onChange, defaultReplicas = 1 } = opts;

  const matchLabels = React.useMemo(
    () => (resource.spec?.selector?.matchLabels as Record<string, string> | undefined) ?? {},
    [resource.spec?.selector?.matchLabels]
  );
  const podLabels =
    (resource.spec?.template?.metadata?.labels as Record<string, string> | undefined) ?? {};

  // Seed defaults once. Effect (not render) so the seed reaches the
  // resource / YAML, not just the form UI.
  const didSeedDefaultsRef = React.useRef(false);
  React.useEffect(() => {
    if (didSeedDefaultsRef.current) return;
    didSeedDefaultsRef.current = true;
    const next = _.cloneDeep(resource) as T;
    let changed = false;
    if (Object.keys(matchLabels).length === 0) {
      _.set(next, 'spec.selector.matchLabels', { ...DEFAULT_MATCH_LABELS });
      _.set(next, 'spec.template.metadata.labels', {
        ...((next.spec?.template?.metadata?.labels as Record<string, string> | undefined) ?? {}),
        ...DEFAULT_MATCH_LABELS,
      });
      changed = true;
    } else {
      // Mirror every selector entry into pod labels, keeping existing extras.
      const mergedPodLabels = { ...podLabels, ...matchLabels };
      if (!labelMapsEqual(mergedPodLabels, podLabels)) {
        _.set(next, 'spec.template.metadata.labels', mergedPodLabels);
        changed = true;
      }
    }
    if (defaultReplicas !== null && next.spec?.replicas === undefined) {
      _.set(next, 'spec.replicas', defaultReplicas);
      changed = true;
    }
    if (changed) {
      onChange(next);
    }
    // Only run once: re-running would clobber user edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleMatchLabelsChange(nextMatch: Record<string, string>) {
    const extras: Record<string, string> = {};
    for (const [k, v] of Object.entries(podLabels)) {
      if (!(k in matchLabels)) extras[k] = v;
    }
    const nextPodLabels = { ...extras, ...nextMatch };

    const nextResource = _.cloneDeep(resource) as T;
    _.set(nextResource, 'spec.selector.matchLabels', nextMatch);
    if (!labelMapsEqual(nextPodLabels, podLabels)) {
      _.set(nextResource, 'spec.template.metadata.labels', nextPodLabels);
    }
    onChange(nextResource);
  }

  return { matchLabels, podLabels, handleMatchLabelsChange };
}

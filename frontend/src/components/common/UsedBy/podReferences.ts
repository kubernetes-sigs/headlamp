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

import type { KubeContainer } from '../../../lib/k8s/cluster';
import type Pod from '../../../lib/k8s/pod';

/** Where a Pod references a ConfigMap or Secret. */
export type UsageKind = 'env' | 'envFrom' | 'volume' | 'projected' | 'imagePullSecret';

export interface PodUsage {
  kind: UsageKind;
  /** Container name for env/envFrom usages. */
  container?: string;
  /** True if the container is an init or ephemeral container (i.e. not a regular container). */
  isInitOrEphemeral?: boolean;
  /** Volume name for volume/projected usages. */
  volume?: string;
}

export interface PodReference {
  pod: Pod;
  usages: PodUsage[];
}

export type TargetKind = 'ConfigMap' | 'Secret';

function scanContainerEnv(
  container: KubeContainer,
  target: TargetKind,
  name: string,
  isInitOrEphemeral: boolean
): PodUsage[] {
  const usages: PodUsage[] = [];

  for (const entry of container.env ?? []) {
    const ref =
      target === 'ConfigMap' ? entry.valueFrom?.configMapKeyRef : entry.valueFrom?.secretKeyRef;
    if (ref?.name === name) {
      usages.push({ kind: 'env', container: container.name, isInitOrEphemeral });
    }
  }

  for (const entry of container.envFrom ?? []) {
    const ref = target === 'ConfigMap' ? entry.configMapRef : entry.secretRef;
    if (ref?.name === name) {
      usages.push({ kind: 'envFrom', container: container.name, isInitOrEphemeral });
    }
  }

  return usages;
}

function scanVolumes(spec: Pod['spec'], target: TargetKind, name: string): PodUsage[] {
  const usages: PodUsage[] = [];

  for (const volume of spec.volumes ?? []) {
    // Direct volume reference. Note: Secret volumes use `secretName`, not `name`.
    if (target === 'ConfigMap' && volume.configMap?.name === name) {
      usages.push({ kind: 'volume', volume: volume.name });
    } else if (target === 'Secret' && volume.secret?.secretName === name) {
      usages.push({ kind: 'volume', volume: volume.name });
    }

    // Projected volume sources. ConfigMap source uses `name`; Secret source also uses `name`
    // (unlike direct Secret volumes which use `secretName`).
    for (const source of volume.projected?.sources ?? []) {
      if (target === 'ConfigMap' && source.configMap?.name === name) {
        usages.push({ kind: 'projected', volume: volume.name });
      } else if (target === 'Secret' && source.secret?.name === name) {
        usages.push({ kind: 'projected', volume: volume.name });
      }
    }
  }

  return usages;
}

type SpecWithImagePullSecrets = NonNullable<Pod['spec']> & {
  imagePullSecrets?: Array<{ name?: string }>;
};

function scanImagePullSecrets(spec: SpecWithImagePullSecrets, name: string): PodUsage[] {
  const usages: PodUsage[] = [];
  for (const ref of spec.imagePullSecrets ?? []) {
    if (ref?.name === name) {
      usages.push({ kind: 'imagePullSecret' });
    }
  }
  return usages;
}

/**
 * Scan a list of Pods and return those that reference the given ConfigMap or Secret
 * (by name, within the Pods' namespace -- the caller is expected to scope `pods` accordingly).
 *
 * Every reference site is reported separately, so a single Pod with envFrom and a volume
 * mount of the same ConfigMap returns two entries in `usages`.
 */
export function findPodReferences(pods: Pod[], target: TargetKind, name: string): PodReference[] {
  if (!name) {
    return [];
  }

  const results: PodReference[] = [];

  for (const pod of pods) {
    const spec = pod.spec;
    if (!spec) {
      continue;
    }

    const usages: PodUsage[] = [];

    for (const container of spec.containers ?? []) {
      usages.push(...scanContainerEnv(container, target, name, false));
    }
    for (const container of spec.initContainers ?? []) {
      usages.push(...scanContainerEnv(container, target, name, true));
    }
    for (const container of spec.ephemeralContainers ?? []) {
      usages.push(...scanContainerEnv(container, target, name, true));
    }

    usages.push(...scanVolumes(spec, target, name));

    if (target === 'Secret') {
      usages.push(...scanImagePullSecrets(spec, name));
    }

    if (usages.length > 0) {
      results.push({ pod, usages });
    }
  }

  return results;
}

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

import { normalizeUnit } from '../util';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';

interface spec {
  hard: {
    [key: string]: string;
  };
  scopes?: string[];
  scopeSelector?: {
    matchExpressions: {
      operator: string;
      scopeName: string;
      values: string[];
    }[];
  };
}

interface status {
  hard: {
    [key: string]: string;
  };
  used: {
    [key: string]: string;
  };
}

export interface KubeResourceQuota extends KubeObjectInterface {
  spec: spec;
  status?: status;
}

class ResourceQuota extends KubeObject<KubeResourceQuota> {
  static kind = 'ResourceQuota';
  static apiName = 'resourcequotas';
  static apiVersion = 'v1';
  static isNamespaced = true;

  static getBaseObject(): KubeResourceQuota {
    const baseObject = super.getBaseObject() as KubeResourceQuota;
    baseObject.spec = { hard: {} };
    return baseObject;
  }

  get spec(): spec {
    return this.jsonData.spec;
  }

  get status(): status | undefined {
    return this.jsonData.status;
  }

  /**
   * Classifies a `spec.hard` key as a compute request, a compute limit, or an
   * object count.
   *
   * A `count/`, `requests.` or `limits.` prefix on the key decides the category
   * on its own, which keeps qualified extended resources such as
   * `requests.nvidia.com/gpu` out of the object counts, and keeps counted
   * resources such as `count/requests.example.com` in them.
   *
   * Otherwise, storage class scoped keys carry the resource after a `/`, as in
   * `gold.storageclass.storage.k8s.io/requests.storage`, so that part is what
   * decides. `cpu`, `memory`, `ephemeral-storage` and `hugepages-<size>` are
   * shorthands for their `requests.` counterparts.
   *
   * @param key - a key of the quota's `spec.hard` map.
   * @returns the category the key belongs to.
   *
   * @see {@link https://kubernetes.io/docs/concepts/policy/resource-quotas/} Kubernetes resource quota reference
   */
  private static quotaKind(key: string): 'request' | 'limit' | 'count' {
    // An explicit `count/` prefix decides on its own, so a resource named after
    // a category, as in `count/requests.example.com`, stays an object count.
    if (key.startsWith('count/')) {
      return 'count';
    }

    // Extended resources are qualified with a domain, as in
    // `requests.nvidia.com/gpu`, so the whole key is checked before the
    // storage class prefix is stripped below.
    if (key.startsWith('limits.')) {
      return 'limit';
    }
    if (key.startsWith('requests.')) {
      return 'request';
    }

    const resource = key.includes('/') ? key.slice(key.indexOf('/') + 1) : key;

    if (resource.startsWith('limits.')) {
      return 'limit';
    }
    if (
      resource.startsWith('requests.') ||
      resource.startsWith('hugepages-') ||
      resource === 'cpu' ||
      resource === 'memory' ||
      resource === 'ephemeral-storage'
    ) {
      return 'request';
    }
    return 'count';
  }

  /**
   * Formats the `spec.hard` entries of a single category as `key: used/hard`.
   *
   * @param kind - the category to report, as classified by {@link quotaKind}.
   * @returns one formatted entry per matching key, in `spec.hard` order.
   */
  private quotasOfKind(kind: 'request' | 'limit' | 'count'): string[] {
    const quotas: string[] = [];
    const used = this.jsonData.status?.used ?? {};
    this.spec.hard &&
      Object.keys(this.spec.hard).forEach(key => {
        if (ResourceQuota.quotaKind(key) === kind) {
          quotas.push(
            `${key}: ${normalizeUnit(key, used[key] ?? '0')}/${normalizeUnit(
              key,
              this.spec.hard[key]
            )}`
          );
        }
      });
    return quotas;
  }

  get requests(): string[] {
    return this.quotasOfKind('request');
  }

  get limits(): string[] {
    return this.quotasOfKind('limit');
  }

  /**
   * Object count quotas, such as `pods`, `services` or `count/deployments.apps`.
   *
   * These are the entries that are neither compute requests nor compute limits,
   * so they are not reported by {@link requests} or {@link limits}.
   */
  get counts(): string[] {
    return this.quotasOfKind('count');
  }

  get resourceStats() {
    const stats: { name: string; hard: string; used: string }[] = [];
    const status = this.jsonData.status;
    const used = status?.used ?? {};
    status?.hard &&
      Object.keys(status.hard).forEach(key => {
        stats.push({
          name: key,
          hard: `${status.hard[key]}`,
          used: `${used[key] ?? '0'}`,
        });
      });
    return stats;
  }
}

export default ResourceQuota;

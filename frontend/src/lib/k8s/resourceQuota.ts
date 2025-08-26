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
  status: status;
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

  get status(): status {
    return this.jsonData.status;
  }

  get requests(): string[] {
    const req: string[] = [];
    this.spec.hard &&
      Object.keys(this.spec.hard).forEach(key => {
        if (key === 'cpu' || key === 'memory' || key.startsWith('requests.')) {
          req.push(
            `${key}: ${normalizeUnit(key, this.status.used[key])}/${normalizeUnit(
              key,
              this.spec.hard[key]
            )}`
          );
        }
      });
    return req;
  }

  get limits(): string[] {
    const limits: string[] = [];
    this.spec.hard &&
      Object.keys(this.spec.hard).forEach(key => {
        if (key.startsWith('limits.')) {
          limits.push(
            `${key}: ${normalizeUnit(key, this.status.used[key])}/${normalizeUnit(
              key,
              this.spec.hard[key]
            )}`
          );
        }
      });
    return limits;
  }

  get resourceStats() {
    const stats: { name: string; hard: string; used: string }[] = [];
    this.status.hard &&
      Object.keys(this.status.hard).forEach(key => {
        stats.push({
          name: key,
          hard: `${this.status.hard[key]}`,
          used: `${this.status.used[key]}`,
        });
      });
    return stats;
  }
}

export default ResourceQuota;

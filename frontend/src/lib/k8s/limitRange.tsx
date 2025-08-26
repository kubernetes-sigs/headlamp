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

import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';

export interface LimitRangeSpec {
  limits: {
    default: {
      cpu: string;
      memory: string;
    };
    defaultRequest: {
      cpu: string;
      memory: string;
    };
    max: {
      cpu: string;
      memory: string;
    };
    min: {
      cpu: string;
      memory: string;
    };
    type: string;
  }[];
}

export interface KubeLimitRange extends KubeObjectInterface {
  spec: LimitRangeSpec;
}

export class LimitRange extends KubeObject<KubeLimitRange> {
  static kind = 'LimitRange';
  static apiName = 'limitranges';
  static apiVersion = 'v1';
  static isNamespaced = true;

  static getBaseObject(): KubeLimitRange {
    const baseObject = super.getBaseObject() as KubeLimitRange;
    baseObject.spec = {
      limits: [
        {
          default: {
            cpu: '',
            memory: '',
          },
          defaultRequest: {
            cpu: '',
            memory: '',
          },
          max: {
            cpu: '',
            memory: '',
          },
          min: {
            cpu: '',
            memory: '',
          },
          type: '',
        },
      ],
    };
    return baseObject;
  }

  get spec() {
    return this.jsonData.spec;
  }
}

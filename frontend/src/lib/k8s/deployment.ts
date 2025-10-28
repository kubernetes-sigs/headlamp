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

import type { KubeContainer, LabelSelector } from './cluster';
import type { KubeMetadata } from './KubeMetadata';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';
import type { KubePodSpec } from './pod';

export interface KubeDeployment extends KubeObjectInterface {
  spec: {
    selector?: LabelSelector;
    strategy?: {
      type: string;
      [otherProps: string]: any;
    };
    template: {
      metadata?: KubeMetadata;
      spec: KubePodSpec;
    };
    [otherProps: string]: any;
  };
  status: {
    [otherProps: string]: any;
  };
}

class Deployment extends KubeObject<KubeDeployment> {
  static kind = 'Deployment';
  static apiName = 'deployments';
  static apiVersion = 'apps/v1';
  static isNamespaced = true;
  static isScalable = true;

  get spec() {
    return this.getValue('spec');
  }

  get status() {
    return this.getValue('status');
  }

  getContainers(): KubeContainer[] {
    return this.spec?.template?.spec?.containers || [];
  }

  getMatchLabelsList(): string[] {
    const labels = this.spec.selector.matchLabels || {};
    return Object.keys(labels).map(key => `${key}=${labels[key]}`);
  }

  static getBaseObject(): KubeDeployment {
    const baseObject = super.getBaseObject() as KubeDeployment;
    baseObject.metadata = {
      ...baseObject.metadata,
      namespace: '',
      labels: { app: 'headlamp' },
    };
    baseObject.spec = {
      selector: {
        matchLabels: { app: 'headlamp' },
      },
      template: {
        spec: {
          containers: [
            {
              name: '',
              image: '',
              ports: [{ containerPort: 80 }],
              imagePullPolicy: 'Always',
            },
          ],
          nodeName: '',
        },
      },
    };

    return baseObject;
  }
}

export default Deployment;

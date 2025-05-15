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
import { KubeMetadata } from '../lib/k8s/KubeMetadata';
import { KubeObject } from '../lib/k8s/KubeObject';
import { KubeObjectInterface } from '../lib/k8s/KubeObject';
import { KubeObjectClass } from '../lib/k8s/KubeObject';

interface K8sResourceListGeneratorOptions<T extends KubeObjectClass> {
  numResults?: number;
  uidPrefix?: string;
  instantiateAs?: T;
}

export function generateK8sResourceList<
  C extends typeof KubeObject<any>,
  T extends KubeObjectInterface
>(
  baseJson: Partial<T>,
  options?: { numResults?: number; instantiateAs: C; uidPrefix?: string }
): InstanceType<C>[];
export function generateK8sResourceList<T extends KubeObjectInterface>(
  baseJson: Partial<T>,
  options?: { numResults?: number; uidPrefix?: string }
): T[];
export function generateK8sResourceList<
  T extends KubeObjectInterface,
  C extends typeof KubeObject<any>
>(baseJson: Partial<T>, options: K8sResourceListGeneratorOptions<C> = {}) {
  const { numResults = 5, instantiateAs } = options;
  const list = [];
  for (let i = 0; i < numResults; i++) {
    const json = {
      metadata: {
        name: '',
      } as KubeMetadata,
      ..._.cloneDeep(baseJson),
    } as T;

    json.metadata.creationTimestamp = new Date('2020-01-01').toISOString();

    if (json.metadata.name) {
      json.metadata.name = json.metadata.name.replace('{{i}}', i.toString());
    }

    if (!json.metadata.name) {
      json.metadata.name = json.kind.toLowerCase() + `-${i}`;
    }

    if (json.metadata.namespace !== undefined) {
      json.metadata.namespace.replace('{{i}}', i.toString());
      if (!json.metadata.namespace) {
        json.metadata.namespace = 'my-namespace';
      }
    }

    json.metadata.resourceVersion = i.toString();
    json.metadata.selfLink = `/${json.kind.toLowerCase()}/${json.metadata.name}`;

    const prefix = options.uidPrefix ?? 'abcde-';

    json.metadata.uid = prefix + i;

    list.push(!!instantiateAs ? new instantiateAs(json as T) : json);
  }

  return list;
}

export const makeMockKubeObject = (partial: Partial<KubeObjectInterface>) =>
  new KubeObject({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: 'my-pod',
      namespace: 'default',
      uid: 'abcde',
      creationTimestamp: new Date('2020-01-01').toISOString(),
      ...partial.metadata,
    },
    ...partial,
  });

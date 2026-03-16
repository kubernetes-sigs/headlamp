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

import { KubeObject } from '../lib/k8s/KubeObject';

export const useMockListQuery = {
  noData: () =>
    ({
      data: null,
      items: null,
      error: null,
      *[Symbol.iterator]() {
        yield null;
        yield null;
      },
    } as any as typeof KubeObject.useList),
  error: () =>
    ({
      data: null,
      items: null,
      error: 'Phony error is phony!',
      *[Symbol.iterator]() {
        yield null;
        yield 'Phony error is phony!';
      },
    } as any as typeof KubeObject.useList),
  data: (items: any[]) =>
    (() => ({
      data: { kind: 'List', items },
      items,
      error: null,
      *[Symbol.iterator]() {
        yield items;
        yield null;
      },
    })) as any as typeof KubeObject.useList,
};

export const getTestDate = () => new Date('2024-02-15');

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

interface KubePodMetrics extends KubeObjectInterface {
  timestamp: string;
  window: string;
  containers: Array<{
    name: string;
    usage: {
      cpu: string;
      memory: string;
    };
  }>;
}

export const METRIC_REFETCH_INTERVAL_MS = 5_000;

export class PodMetrics extends KubeObject<KubePodMetrics> {
  static kind = 'PodMetric';
  static apiName = 'pods';
  static apiVersion = 'metrics.k8s.io/v1beta1';
  static isNamespaced = true;
}

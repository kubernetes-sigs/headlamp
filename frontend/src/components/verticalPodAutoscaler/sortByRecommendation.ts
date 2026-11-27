/*
 * Copyright 2026 The Kubernetes Authors
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

import type VPA from '../../lib/k8s/vpa';
import { parseCpu, parseRam } from '../../lib/units';

/**
 * Sorts VPAs by their recommended CPU, so 500m comes before 1 core.
 * VPAs without a recommendation yet sort first.
 */
export function sortByCpuRecommendation(a: VPA, b: VPA) {
  return (
    parseCpu(a.targetRecommendations?.cpu ?? '') - parseCpu(b.targetRecommendations?.cpu ?? '')
  );
}

/**
 * Sorts VPAs by their recommended memory in bytes, so 262144k comes before 1Gi.
 * VPAs without a recommendation yet sort first.
 */
export function sortByMemoryRecommendation(a: VPA, b: VPA) {
  return (
    parseRam(a.targetRecommendations?.memory ?? '') -
    parseRam(b.targetRecommendations?.memory ?? '')
  );
}

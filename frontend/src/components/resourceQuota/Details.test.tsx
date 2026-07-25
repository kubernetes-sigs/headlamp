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

import App from '../../App';
import { getUsageRatio } from './Details';
// circular dependency fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('getUsageRatio', () => {
  // CPU
  it('computes ratio for CPU in cores', () => {
    expect(getUsageRatio('cpu', '1', '2')).toBeCloseTo(0.5);
  });

  it('computes ratio for fractional CPU cores', () => {
    expect(getUsageRatio('cpu', '0.5', '1')).toBeCloseTo(0.5);
  });

  it('computes ratio for CPU in millicores', () => {
    expect(getUsageRatio('cpu', '500m', '1000m')).toBeCloseTo(0.5);
  });

  it('computes ratio for requests.cpu', () => {
    expect(getUsageRatio('requests.cpu', '250m', '1000m')).toBeCloseTo(0.25);
  });

  it('computes ratio for limits.cpu', () => {
    expect(getUsageRatio('limits.cpu', '900m', '1000m')).toBeCloseTo(0.9);
  });

  // Memory
  it('computes ratio for memory', () => {
    expect(getUsageRatio('memory', '512Mi', '1Gi')).toBeCloseTo(0.5);
  });

  it('computes ratio for hugepages-2Mi', () => {
    expect(getUsageRatio('hugepages-2Mi', '512Mi', '1Gi')).toBeCloseTo(0.5);
  });

  it('computes ratio for requests.memory', () => {
    expect(getUsageRatio('requests.memory', '256Mi', '1Gi')).toBeCloseTo(0.25);
  });

  // Count
  it('computes ratio for pods', () => {
    expect(getUsageRatio('pods', '5', '10')).toBeCloseTo(0.5);
  });

  it('computes ratio for configmaps', () => {
    expect(getUsageRatio('configmaps', '0', '20')).toBe(0);
  });

  it('computes ratio for count/ prefixed resources', () => {
    expect(getUsageRatio('count/deployments.apps', '3', '10')).toBeCloseTo(0.3);
  });

  // Edge cases
  it('returns 0 when hard is 0', () => {
    expect(getUsageRatio('pods', '5', '0')).toBe(0);
  });

  it('returns ratio above 1 when used exceeds hard', () => {
    expect(getUsageRatio('pods', '15', '10')).toBeCloseTo(1.5);
  });

  it('handles empty used as 0', () => {
    expect(getUsageRatio('pods', '', '10')).toBe(0);
  });

  it('computes ratio for requests.storage', () => {
    expect(getUsageRatio('requests.storage', '512Mi', '1Gi')).toBeCloseTo(0.5);
  });
});

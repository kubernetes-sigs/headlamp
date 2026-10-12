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

import type { KubeCondition } from '../../lib/k8s/cluster';
import { getSchedulingStatusSeverity, getSchedulingStatusText } from './SchedulingStatus';

const condition = (status: string, reason?: string): KubeCondition =>
  ({ type: 'CompositePodGroupInitiallyScheduled', status, reason } as KubeCondition);

const t = (key: string) => key.replace(/^translation\|/, '');

describe('getSchedulingStatusSeverity', () => {
  it('reports a scheduled group as success', () => {
    expect(getSchedulingStatusSeverity(condition('True', 'Scheduled'))).toBe('success');
  });

  it('reports a group that failed to schedule as a warning', () => {
    expect(getSchedulingStatusSeverity(condition('False', 'Unschedulable'))).toBe('warning');
  });

  it('reports an invalid layout as a warning even though its status is True', () => {
    // The API reports an invalid hierarchy with reason Invalid and status True, so the
    // reason has to win over the status.
    expect(getSchedulingStatusSeverity(condition('True', 'Invalid'))).toBe('warning');
  });

  it('stays neutral while the API has not decided', () => {
    expect(getSchedulingStatusSeverity(condition('Unknown'))).toBe('');
  });
});

describe('getSchedulingStatusText', () => {
  it('prefers the reason and falls back to a localized label', () => {
    expect(getSchedulingStatusText(condition('True', 'Invalid'), t)).toBe('Invalid');
    expect(getSchedulingStatusText(condition('True'), t)).toBe('Scheduled');
    expect(getSchedulingStatusText(condition('False'), t)).toBe('Pending');
    expect(getSchedulingStatusText(condition('Unknown'), t)).toBe('Unknown');
    expect(getSchedulingStatusText(undefined, t)).toBe('Unknown');
  });
});

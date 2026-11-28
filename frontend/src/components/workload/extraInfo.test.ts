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

import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import type Job from '../../lib/k8s/job';
import type StatefulSet from '../../lib/k8s/statefulSet';
import { jobExtraInfo, statefulSetExtraInfo } from './extraInfo';

// Passthrough translator: returns the key so rows can be matched by name.
const t = ((key: string) => key) as TFunction;

function jobWithDuration(durationMs: number): Job {
  return { status: {}, spec: {}, getDuration: () => durationMs } as unknown as Job;
}

function durationRow(item: Job) {
  return jobExtraInfo(item, t).find(row => row && row.name === 'glossary|Duration');
}

describe('jobExtraInfo duration', () => {
  it('hides the Duration row for a running job (getDuration() === -1)', () => {
    expect(durationRow(jobWithDuration(-1))?.hide).toBe(true);
  });

  it('shows the Duration row once the job has a real duration', () => {
    // 0ms is a legitimate completed-job duration (startTime === completionTime).
    for (const durationMs of [0, 5000]) {
      const row = durationRow(jobWithDuration(durationMs));
      expect(row?.hide).toBeFalsy();
      expect(row?.value).toBeTruthy();
    }
  });
});

describe('statefulSetExtraInfo rollout and retention rows', () => {
  function rows(spec: object) {
    const item = {
      metadata: { name: 'web', namespace: 'default' },
      spec,
    } as unknown as StatefulSet;
    const all = statefulSetExtraInfo(item, t);
    return (name: string) => all.find(row => row && row.name === `glossary|${name}`);
  }

  it('hides the rows when the spec does not set them', () => {
    const row = rows({ updateStrategy: { type: 'OnDelete' } });
    for (const name of [
      'Partition',
      'Min Ready Seconds',
      'Start Ordinal',
      'PVC Retention Policy',
    ]) {
      expect(row(name)?.hide).toBe(true);
    }
  });

  it('shows the rows when the spec sets them', () => {
    const row = rows({
      updateStrategy: { type: 'RollingUpdate', rollingUpdate: { partition: 0 } },
      minReadySeconds: 10,
      ordinals: { start: 1 },
      persistentVolumeClaimRetentionPolicy: { whenDeleted: 'Delete' },
    });
    // A partition of 0 updates every pod, and it is still shown.
    expect(row('Partition')).toMatchObject({ value: 0, hide: false });
    expect(row('Min Ready Seconds')).toMatchObject({ value: '10s', hide: false });
    expect(row('Start Ordinal')).toMatchObject({ value: 1, hide: false });
    expect(row('PVC Retention Policy')?.hide).toBe(false);
  });
});

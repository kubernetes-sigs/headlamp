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

import { describe, expect, it } from 'vitest';
import App from '../../App';
import CronJob from './cronJob';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('CronJob class', () => {
  describe('getHealth', () => {
    const makeCronJob = (spec: any = {}, status: any = {}) =>
      new CronJob({
        apiVersion: 'batch/v1',
        kind: 'CronJob',
        metadata: { name: 'test-cronjob', namespace: 'default' },
        spec: { schedule: '* * * * *', ...spec },
        status,
      } as any);

    it('classifies a suspended cron job as degraded', () => {
      expect(makeCronJob({ suspend: true }).getHealth()).toBe('degraded');
    });

    it('classifies a cron job with active jobs as transitional', () => {
      expect(makeCronJob({}, { active: [{ name: 'job-1' }] }).getHealth()).toBe('transitional');
    });

    it('classifies a never-run cron job as healthy', () => {
      expect(makeCronJob().getHealth()).toBe('healthy');
    });

    it('classifies a cron job whose last run succeeded as healthy', () => {
      expect(
        makeCronJob(
          {},
          { lastScheduleTime: '2026-01-01T00:00:00Z', lastSuccessfulTime: '2026-01-01T00:01:00Z' }
        ).getHealth()
      ).toBe('healthy');
    });

    it('classifies a cron job scheduled but never succeeded as failed', () => {
      expect(makeCronJob({}, { lastScheduleTime: '2026-01-01T00:00:00Z' }).getHealth()).toBe(
        'failed'
      );
    });

    it('classifies a cron job whose last schedule is newer than last success as failed', () => {
      expect(
        makeCronJob(
          {},
          { lastScheduleTime: '2026-01-01T00:05:00Z', lastSuccessfulTime: '2026-01-01T00:00:00Z' }
        ).getHealth()
      ).toBe('failed');
    });

    it('treats suspend as taking priority over a failing schedule', () => {
      expect(
        makeCronJob({ suspend: true }, { lastScheduleTime: '2026-01-01T00:00:00Z' }).getHealth()
      ).toBe('degraded');
    });
  });
});

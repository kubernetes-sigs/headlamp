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

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CronJob from '../../lib/k8s/cronJob';
import CronJobList, { getLastScheduleTime, getSchedule } from './List';

const { mockResourceListView } = vi.hoisted(() => ({
  mockResourceListView: vi.fn(),
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockResourceListView(props);
    return null;
  },
}));

vi.mock('react-i18next', async importOriginal => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

describe('CronJobList helpers and column definitions', () => {
  beforeEach(() => {
    mockResourceListView.mockReset();
  });

  describe('getLastScheduleTime', () => {
    it('returns empty string when status is undefined', () => {
      const cronJob = new CronJob({
        apiVersion: 'batch/v1',
        kind: 'CronJob',
        metadata: { name: 'test-cronjob', namespace: 'default' },
      } as any);

      expect(getLastScheduleTime(cronJob)).toBe('');
    });

    it('returns empty string when lastScheduleTime is undefined', () => {
      const cronJob = new CronJob({
        apiVersion: 'batch/v1',
        kind: 'CronJob',
        metadata: { name: 'test-cronjob', namespace: 'default' },
        status: {},
      } as any);

      expect(getLastScheduleTime(cronJob)).toBe('');
    });

    it('renders DateLabel when lastScheduleTime is present', () => {
      const cronJob = new CronJob({
        apiVersion: 'batch/v1',
        kind: 'CronJob',
        metadata: { name: 'test-cronjob', namespace: 'default' },
        status: { lastScheduleTime: '2026-01-01T00:00:00Z' },
      } as any);

      const result = getLastScheduleTime(cronJob);
      expect(result).not.toBe('');
      const { container } = render(result as React.ReactElement);
      expect(container).toBeDefined();
    });
  });

  describe('getSchedule', () => {
    it('returns empty string when spec is undefined', () => {
      const cronJob = new CronJob({
        apiVersion: 'batch/v1',
        kind: 'CronJob',
        metadata: { name: 'test-cronjob', namespace: 'default' },
      } as any);

      expect(getSchedule(cronJob, 'en')).toBe('');
    });

    it('returns empty string when schedule is empty', () => {
      const cronJob = new CronJob({
        apiVersion: 'batch/v1',
        kind: 'CronJob',
        metadata: { name: 'test-cronjob', namespace: 'default' },
        spec: {},
      } as any);

      expect(getSchedule(cronJob, 'en')).toBe('');
    });

    it('renders HoverInfoLabel when schedule is present', () => {
      const cronJob = new CronJob({
        apiVersion: 'batch/v1',
        kind: 'CronJob',
        metadata: { name: 'test-cronjob', namespace: 'default' },
        spec: { schedule: '0 0 * * *' },
      } as any);

      const result = getSchedule(cronJob, 'en');
      render(result as React.ReactElement);
      expect(screen.getByText('0 0 * * *')).toBeDefined();
    });
  });

  describe('CronJobList columns', () => {
    it('handles cronjob with undefined spec and status without throwing', () => {
      render(<CronJobList />);

      const props = mockResourceListView.mock.calls[0][0];
      const cronJobWithoutSpecOrStatus = new CronJob({
        apiVersion: 'batch/v1',
        kind: 'CronJob',
        metadata: { name: 'test-cronjob', namespace: 'default' },
      } as any);

      for (const col of props.columns) {
        if (typeof col === 'object' && typeof col.getValue === 'function') {
          expect(() => col.getValue(cronJobWithoutSpecOrStatus)).not.toThrow();
        }
        if (typeof col === 'object' && typeof col.render === 'function') {
          expect(() => col.render(cronJobWithoutSpecOrStatus)).not.toThrow();
        }
      }

      const scheduleCol = props.columns.find((c: any) => c.id === 'schedule');
      expect(scheduleCol.getValue(cronJobWithoutSpecOrStatus)).toBe('');

      const suspendCol = props.columns.find((c: any) => c.id === 'suspend');
      expect(suspendCol.getValue(cronJobWithoutSpecOrStatus)).toBe('false');

      const activeCol = props.columns.find((c: any) => c.id === 'active');
      expect(activeCol.getValue(cronJobWithoutSpecOrStatus)).toBe(0);

      const lastScheduleCol = props.columns.find((c: any) => c.id === 'lastScheduleTime');
      expect(lastScheduleCol.getValue(cronJobWithoutSpecOrStatus)).toBe('');

      const containersCol = props.columns.find((c: any) => c.id === 'containers');
      expect(containersCol.getValue(cronJobWithoutSpecOrStatus)).toBe('');

      const imagesCol = props.columns.find((c: any) => c.id === 'images');
      expect(imagesCol.getValue(cronJobWithoutSpecOrStatus)).toBe('');
    });
  });
});

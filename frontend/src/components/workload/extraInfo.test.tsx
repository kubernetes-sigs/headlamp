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

import { TFunction } from 'i18next';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import App from '../../App';
import Deployment from '../../lib/k8s/deployment';
import Job from '../../lib/k8s/job';
import StatefulSet from '../../lib/k8s/statefulSet';
import {
  deploymentExtraInfo,
  formatDuration,
  jobExtraInfo,
  statefulSetExtraInfo,
} from './extraInfo';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const mockT = vi.fn((key: string, options?: Record<string, unknown>) => {
  if (options && options.n !== undefined) {
    return `${key} (n=${options.n})`;
  }
  return key;
}) as unknown as TFunction;

describe('workload extraInfo', () => {
  describe('formatDuration', () => {
    it('returns empty string for negative values', () => {
      expect(formatDuration(-1)).toBe('');
      expect(formatDuration(-1000)).toBe('');
    });

    it('formats seconds correctly', () => {
      expect(formatDuration(0)).toBe('0s');
      expect(formatDuration(500)).toBe('0s');
      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(59000)).toBe('59s');
    });

    it('formats minutes correctly', () => {
      expect(formatDuration(60000)).toBe('1m');
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(119000)).toBe('1m 59s');
      expect(formatDuration(120000)).toBe('2m');
      expect(formatDuration(3599000)).toBe('59m 59s');
    });

    it('formats hours correctly', () => {
      expect(formatDuration(3600000)).toBe('1h');
      expect(formatDuration(5400000)).toBe('1h 30m');
      expect(formatDuration(7200000)).toBe('2h');
      expect(formatDuration(86399000)).toBe('23h 59m');
    });

    it('formats days correctly', () => {
      expect(formatDuration(86400000)).toBe('1d');
      expect(formatDuration(129600000)).toBe('1d 12h');
      expect(formatDuration(172800000)).toBe('2d');
    });
  });

  describe('deploymentExtraInfo', () => {
    it('returns correct rows when all fields are populated', () => {
      const mockDeployment = {
        spec: {
          minReadySeconds: 10,
          progressDeadlineSeconds: 600,
          revisionHistoryLimit: 5,
        },
      } as unknown as Deployment;

      const info = deploymentExtraInfo(mockDeployment, mockT);
      expect(info).toHaveLength(3);

      expect(info[0].name).toBe('glossary|Min Ready Seconds');
      expect(info[0].value).toBe('10s');
      expect(info[0].hide).toBe(false);

      expect(info[1].name).toBe('glossary|Progress Deadline');
      expect(info[1].value).toBe('600s');
      expect(info[1].hide).toBe(false);

      expect(info[2].name).toBe('glossary|Revision History Limit');
      expect(info[2].value).toBe(5);
      expect(info[2].hide).toBe(false);
    });

    it('hides rows when fields are undefined', () => {
      const mockDeployment = {
        spec: {},
      } as unknown as Deployment;

      const info = deploymentExtraInfo(mockDeployment, mockT);
      expect(info[0].hide).toBe(true);
      expect(info[1].hide).toBe(true);
      expect(info[2].hide).toBe(true);
    });

    it('handles null spec gracefully', () => {
      const mockDeployment = {} as unknown as Deployment;
      const info = deploymentExtraInfo(mockDeployment, mockT);
      expect(info).toHaveLength(3);
      expect(info[0].hide).toBe(true);
    });
  });

  describe('statefulSetExtraInfo', () => {
    it('returns correct rows when serviceName is present', () => {
      const mockStatefulSet = {
        cluster: 'my-cluster',
        metadata: {
          namespace: 'my-namespace',
        },
        spec: {
          serviceName: 'my-service',
          podManagementPolicy: 'OrderedReady',
        },
      } as unknown as StatefulSet;

      const info = statefulSetExtraInfo(mockStatefulSet, mockT);
      expect(info).toHaveLength(2);

      expect(info[0].name).toBe('glossary|Service Name');
      expect(info[0].hide).toBe(false);
      // Verify Link component props
      const linkComponent = info[0].value as React.ReactElement;
      expect(linkComponent.props.routeName).toBe('service');
      expect(linkComponent.props.params).toEqual({
        namespace: 'my-namespace',
        name: 'my-service',
      });
      expect(linkComponent.props.activeCluster).toBe('my-cluster');
      expect(linkComponent.props.children).toBe('my-service');

      expect(info[1].name).toBe('glossary|Pod Management Policy');
      expect(info[1].value).toBe('OrderedReady');
      expect(info[1].hide).toBe(false);
    });

    it('hides rows when serviceName and podManagementPolicy are missing', () => {
      const mockStatefulSet = {
        spec: {},
      } as unknown as StatefulSet;

      const info = statefulSetExtraInfo(mockStatefulSet, mockT);
      expect(info[0].hide).toBe(true);
      expect(info[1].hide).toBe(true);
    });
  });

  describe('jobExtraInfo', () => {
    it('returns correct rows for Job with all status counts and duration', () => {
      const mockJob = {
        getDuration: () => 125000,
        status: {
          active: 1,
          ready: 2,
          succeeded: 3,
          failed: 4,
          startTime: '2026-07-02T12:00:00Z',
          completionTime: '2026-07-02T12:02:05Z',
          completedIndexes: '0-2',
        },
        spec: {
          completions: 5,
          parallelism: 2,
          completionMode: 'Indexed',
          suspend: false,
          backoffLimit: 6,
          activeDeadlineSeconds: 120,
          ttlSecondsAfterFinished: 60,
        },
      } as unknown as Job;

      const info = jobExtraInfo(mockJob, mockT);

      // Verify glossary|Completions
      const completionsRow = info.find(r => r.name === 'glossary|Completions');
      expect(completionsRow).toBeDefined();
      expect(completionsRow!.value).toBe('3/5');
      expect(completionsRow!.hide).toBe(false);

      // Verify glossary|Parallelism
      const parallelismRow = info.find(r => r.name === 'glossary|Parallelism');
      expect(parallelismRow).toBeDefined();
      expect(parallelismRow!.value).toBe(2);
      expect(parallelismRow!.hide).toBe(false);

      // Verify glossary|Completion Mode
      const completionModeRow = info.find(r => r.name === 'glossary|Completion Mode');
      expect(completionModeRow).toBeDefined();
      expect(completionModeRow!.value).toBe('Indexed');
      expect(completionModeRow!.hide).toBe(false);

      // Verify translation|Suspend
      const suspendRow = info.find(r => r.name === 'translation|Suspend');
      expect(suspendRow).toBeDefined();
      expect(suspendRow!.value).toBe('false');
      expect(suspendRow!.hide).toBe(false);

      // Verify glossary|Backoff Limit
      const backoffLimitRow = info.find(r => r.name === 'glossary|Backoff Limit');
      expect(backoffLimitRow).toBeDefined();
      expect(backoffLimitRow!.value).toBe(6);
      expect(backoffLimitRow!.hide).toBe(false);

      // Verify glossary|Active Deadline
      const activeDeadlineRow = info.find(r => r.name === 'glossary|Active Deadline');
      expect(activeDeadlineRow).toBeDefined();
      expect(activeDeadlineRow!.value).toBe('120s');
      expect(activeDeadlineRow!.hide).toBe(false);

      // Verify glossary|TTL After Finished
      const ttlRow = info.find(r => r.name === 'glossary|TTL After Finished');
      expect(ttlRow).toBeDefined();
      expect(ttlRow!.value).toBe('60s');
      expect(ttlRow!.hide).toBe(false);

      // Verify glossary|Pods Status
      const podsStatusRow = info.find(r => r.name === 'glossary|Pods Status');
      expect(podsStatusRow).toBeDefined();
      expect(podsStatusRow!.value).toContain('translation|Active: {{ n }} (n=1)');
      expect(podsStatusRow!.value).toContain('translation|Ready: {{ n }} (n=2)');
      expect(podsStatusRow!.value).toContain('translation|Succeeded: {{ n }} (n=3)');
      expect(podsStatusRow!.value).toContain('translation|Failed: {{ n }} (n=4)');

      // Verify glossary|Duration
      const durationRow = info.find(r => r.name === 'glossary|Duration');
      expect(durationRow).toBeDefined();
      expect(durationRow!.value).toBe('2m 5s');
      expect(durationRow!.hide).toBe(false);

      // Verify glossary|Completed Indexes
      const completedIndexesRow = info.find(r => r.name === 'glossary|Completed Indexes');
      expect(completedIndexesRow).toBeDefined();
      expect(completedIndexesRow!.value).toBe('0-2');
      expect(completedIndexesRow!.hide).toBe(false);
    });

    it('correctly handles job completions value when completions spec is undefined', () => {
      const mockJob = {
        getDuration: () => -1,
        status: {
          succeeded: 3,
        },
        spec: {},
      } as unknown as Job;

      const info = jobExtraInfo(mockJob, mockT);
      const completionsRow = info.find(r => r.name === 'glossary|Completions');
      expect(completionsRow!.value).toBe('3');
      expect(completionsRow!.hide).toBe(false);
    });
  });
});

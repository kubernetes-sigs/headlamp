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

import cronstrue from 'cronstrue/i18n';
import { describe, expect, it, vi } from 'vitest';
import { supportedLanguages } from '../../i18n/config';
import CronJob, { type KubeCronJob } from '../../lib/k8s/cronJob';
import { getCronstrueLocale, getLastScheduleTime, getSchedule } from './List';

vi.mock('react-i18next', async importOriginal => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

describe('getCronstrueLocale', () => {
  it.each([
    ['en', 'en'],
    ['tr', 'tr'],
    ['pt-BR', 'pt_BR'],
    ['pt-PT', 'pt_PT'],
    ['pt', 'pt_PT'],
    ['zh-TW', 'zh_TW'],
    ['zh', 'zh_CN'],
    ['en-US', 'en'],
    ['hi', 'en'],
  ])('maps %s to %s', (language, expected) => {
    expect(getCronstrueLocale(language)).toBe(expected);
  });

  it('gives cronstrue a known locale for every supported language', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const language of Object.keys(supportedLanguages)) {
      cronstrue.toString('0 9 * * 1', { locale: getCronstrueLocale(language) });
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

function makeCronJob(json: Partial<KubeCronJob>): CronJob {
  return new CronJob({
    apiVersion: 'batch/v1',
    kind: 'CronJob',
    metadata: {
      name: 'test-cronjob',
      namespace: 'default',
      uid: 'test-uid',
      creationTimestamp: '2026-01-01T00:00:00Z',
      resourceVersion: '1',
    },
    ...json,
  } as KubeCronJob);
}

describe('CronJob list helpers with missing spec/status', () => {
  it('getSchedule does not crash when spec is undefined', () => {
    const cronJob = makeCronJob({});
    const element = getSchedule(cronJob, 'en');
    expect(element.props.label).toBe('');
  });

  it('getSchedule returns the schedule when spec is present', () => {
    const cronJob = makeCronJob({
      spec: {
        suspend: false,
        schedule: '*/5 * * * *',
        concurrencyPolicy: 'Allow',
        jobTemplate: {
          spec: {
            template: {
              spec: {
                containers: [{ name: '', image: '' }],
              },
            },
          },
        },
      } as KubeCronJob['spec'],
    });
    const element = getSchedule(cronJob, 'en');
    expect(element.props.label).toBe('*/5 * * * *');
  });

  it('getLastScheduleTime returns empty string when status is undefined', () => {
    const cronJob = makeCronJob({});
    expect(getLastScheduleTime(cronJob)).toBe('');
  });

  it('getLastScheduleTime returns a label when lastScheduleTime is set', () => {
    const cronJob = makeCronJob({
      status: { lastScheduleTime: '2026-11-14T10:00:00Z' },
    });
    const element = getLastScheduleTime(cronJob);
    expect(typeof element).toBe('object');
    expect((element as { props: { date: string } }).props.date).toBe('2026-11-14T10:00:00Z');
  });

  it('getContainers returns an empty list when spec is undefined', () => {
    const cronJob = makeCronJob({});
    expect(cronJob.getContainers()).toEqual([]);
  });
});

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
import { localeDate } from '../../lib/util';
import { getPrinterColumnValue, toJSONPathPlus } from './printerColumnValue';

describe('getPrinterColumnValue', () => {
  const dateCol = { name: 'Finished', type: 'date', jsonPath: '.status.completionTime' };

  it('returns an empty string for a date column whose field is missing', () => {
    const item = { jsonData: { metadata: { name: 'still-running' } } };

    expect(getPrinterColumnValue(item, dateCol)).toBe('');
  });

  it('formats a date column whose field is set', () => {
    const completionTime = '2026-10-10T09:30:00Z';
    const item = { jsonData: { status: { completionTime } } };

    const value = getPrinterColumnValue(item, dateCol);

    expect(value).toBe(localeDate(new Date(completionTime)));
    expect(value).not.toBe('Invalid Date');
  });

  it('returns non-date columns as strings', () => {
    const item = { jsonData: { status: { phase: 'Running' } } };

    expect(getPrinterColumnValue(item, { type: 'string', jsonPath: '.status.phase' })).toBe(
      'Running'
    );
    expect(getPrinterColumnValue(item, { type: 'integer', jsonPath: '.status.missing' })).toBe('');
  });

  it('reads a label key with escaped dots, as Cluster API printer columns do', () => {
    const item = {
      jsonData: { metadata: { labels: { 'cluster.x-k8s.io/cluster-name': 'prod-eu' } } },
    };

    expect(
      getPrinterColumnValue(item, {
        type: 'string',
        jsonPath: '.metadata.labels.cluster\\.x-k8s\\.io/cluster-name',
      })
    ).toBe('prod-eu');
  });

  it('evaluates a filter on a label key with escaped dots', () => {
    const item = {
      jsonData: {
        spec: {
          machines: [
            { name: 'a', labels: { 'cluster.x-k8s.io/cluster-name': 'dev' } },
            { name: 'b', labels: { 'cluster.x-k8s.io/cluster-name': 'prod' } },
          ],
        },
      },
    };

    expect(
      getPrinterColumnValue(item, {
        type: 'string',
        jsonPath: '.spec.machines[?(@.labels.cluster\\.x-k8s\\.io/cluster-name=="prod")].name',
      })
    ).toBe('b');
  });
});

describe('toJSONPathPlus', () => {
  it('leaves paths without escaped dots unchanged', () => {
    expect(toJSONPathPlus('.status.phase')).toBe('.status.phase');
    expect(toJSONPathPlus('.status.conditions[?(@.type=="Ready")].status')).toBe(
      '.status.conditions[?(@.type=="Ready")].status'
    );
  });

  it('rewrites a key with escaped dots in bracket notation', () => {
    expect(toJSONPathPlus('.metadata.labels.cluster\\.x-k8s\\.io/cluster-name')).toBe(
      ".metadata.labels['cluster.x-k8s.io/cluster-name']"
    );
  });

  it('rewrites escaped-dot fields inside a filter', () => {
    expect(
      toJSONPathPlus(
        '.spec.items[?(@.metadata.labels.cluster\\.x-k8s\\.io/cluster-name=="prod")].name'
      )
    ).toBe('.spec.items[?(@.metadata.labels[\'cluster.x-k8s.io/cluster-name\']=="prod")].name');
  });

  it('leaves quoted strings in a filter alone', () => {
    expect(toJSONPathPlus('.spec.items[?(@.note=="a\\.b")].example\\.com/name')).toBe(
      '.spec.items[?(@.note=="a\\.b")][\'example.com/name\']'
    );
  });

  it('keeps the rest of the path after the escaped key', () => {
    expect(toJSONPathPlus('.spec.example\\.com/items[0].name')).toBe(
      ".spec['example.com/items'][0].name"
    );
  });
});

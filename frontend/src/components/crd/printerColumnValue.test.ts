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
import { getPrinterColumnValue } from './printerColumnValue';

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
});

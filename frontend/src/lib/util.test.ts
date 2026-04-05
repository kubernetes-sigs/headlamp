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

import { combineClusterListErrors, flattenClusterListItems, formatDuration, timeAgo } from './util';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;
const NEG_TWO_SECONDS_PLUS_ONE_NS = -1999999999 / 1e6;

describe('flattenClusterListItems', () => {
  it('should return a flattened list of items', () => {
    const result = flattenClusterListItems(
      { cluster1: [1, 2, 3], cluster2: [4, 5] },
      { cluster3: [6, 7], cluster4: null },
      null
    );
    expect(result).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('should return null if all clusters are null', () => {
    const result = flattenClusterListItems({ cluster1: null }, { cluster2: null }, null);
    expect(result).toBeNull();
  });

  it('should return null if there are no items', () => {
    const result = flattenClusterListItems({ cluster1: [] }, { cluster2: [] });
    expect(result).toBeNull();
  });

  it('should handle mixed null and non-null clusters', () => {
    const result = flattenClusterListItems(
      { cluster1: [1, 2], cluster2: null },
      { cluster3: [3, 4] },
      null
    );
    expect(result).toEqual([1, 2, 3, 4]);
  });
});

describe('combineClusterListErrors', () => {
  it('should return null if there are no errors', () => {
    const result = combineClusterListErrors(null, null);
    expect(result).toBeNull();
  });

  it('should combine errors from multiple clusters', () => {
    const error1 = { message: 'Error 1', status: 500, name: 'InternalServerError' };
    const error2 = { message: 'Error 2', status: 404, name: 'NotFoundError' };
    const clusterErrors1 = { clusterA: error1 };
    const clusterErrors2 = { clusterB: error2 };

    const result = combineClusterListErrors(clusterErrors1, clusterErrors2);
    expect(result).toEqual({
      clusterA: error1,
      clusterB: error2,
    });
  });

  it('should ignore null errors', () => {
    const error1 = { message: 'Error 1', status: 500, name: 'InternalServerError' };
    const clusterErrors1 = { clusterA: error1 };
    const clusterErrors2 = { clusterB: null };

    const result = combineClusterListErrors(clusterErrors1, clusterErrors2);
    expect(result).toEqual({
      clusterA: error1,
    });
  });

  it('should return null if all errors are null', () => {
    const clusterErrors1 = { clusterA: null };
    const clusterErrors2 = { clusterB: null };

    const result = combineClusterListErrors(clusterErrors1, clusterErrors2);
    expect(result).toBeNull();
  });
});

const HUMAN_DURATION_CASES: { ms: number; want: string }[] = [
  { ms: 1 * SECOND, want: '1s' },
  { ms: 70 * SECOND, want: '70s' },
  { ms: 190 * SECOND, want: '3m10s' },
  { ms: 70 * MINUTE, want: '70m' },
  { ms: 47 * HOUR, want: '47h' },
  { ms: 49 * HOUR, want: '2d1h' },
  { ms: (8 * 24 + 2) * HOUR, want: '8d' },
  { ms: 367 * 24 * HOUR, want: '367d' },
  { ms: (365 * 2 * 24 + 25) * HOUR, want: '2y1d' },
  { ms: (365 * 8 * 24 + 2) * HOUR, want: '8y' },
];

const HUMAN_DURATION_BOUNDARY_CASES: { ms: number; want: string }[] = [
  { ms: -2 * SECOND, want: '<invalid>' },
  { ms: NEG_TWO_SECONDS_PLUS_ONE_NS, want: '0s' },
  { ms: 0, want: '0s' },
  { ms: SECOND - 1, want: '0s' },
  { ms: 2 * MINUTE - 1, want: '119s' },
  { ms: 2 * MINUTE, want: '2m' },
  { ms: 2 * MINUTE + SECOND, want: '2m1s' },
  { ms: 10 * MINUTE - 1, want: '9m59s' },
  { ms: 10 * MINUTE, want: '10m' },
  { ms: 10 * MINUTE + SECOND, want: '10m' },
  { ms: 3 * HOUR - 1, want: '179m' },
  { ms: 3 * HOUR, want: '3h' },
  { ms: 3 * HOUR + MINUTE, want: '3h1m' },
  { ms: 8 * HOUR - 1, want: '7h59m' },
  { ms: 8 * HOUR, want: '8h' },
  { ms: 8 * HOUR + 59 * MINUTE, want: '8h' },
  { ms: 2 * DAY - 1, want: '47h' },
  { ms: 2 * DAY, want: '2d' },
  { ms: 2 * DAY + HOUR, want: '2d1h' },
  { ms: 8 * DAY - 1, want: '7d23h' },
  { ms: 8 * DAY, want: '8d' },
  { ms: 8 * DAY + 23 * HOUR, want: '8d' },
  { ms: 2 * YEAR - 1, want: '729d' },
  { ms: 2 * YEAR, want: '2y' },
  { ms: 2 * YEAR + 23 * HOUR, want: '2y' },
  { ms: 2 * YEAR + 23 * HOUR + 59 * MINUTE, want: '2y' },
  { ms: 2 * YEAR + 24 * HOUR - 1, want: '2y' },
  { ms: 2 * YEAR + 24 * HOUR, want: '2y1d' },
  { ms: 3 * YEAR, want: '3y' },
  { ms: 4 * YEAR, want: '4y' },
  { ms: 5 * YEAR, want: '5y' },
  { ms: 6 * YEAR, want: '6y' },
  { ms: 7 * YEAR, want: '7y' },
  { ms: 8 * YEAR - 1, want: '7y364d' },
  { ms: 8 * YEAR, want: '8y' },
  { ms: 8 * YEAR + 364 * DAY, want: '8y' },
  { ms: 9 * YEAR, want: '9y' },
];

const SHORT_HUMAN_DURATION_BOUNDARY_CASES: { ms: number; want: string }[] = [
  { ms: -2 * SECOND, want: '<invalid>' },
  { ms: NEG_TWO_SECONDS_PLUS_ONE_NS, want: '0s' },
  { ms: 0, want: '0s' },
  { ms: SECOND - 1, want: '0s' },
  { ms: SECOND, want: '1s' },
  { ms: 2 * SECOND - 1, want: '1s' },
  { ms: MINUTE - 1, want: '59s' },
  { ms: MINUTE, want: '1m' },
  { ms: 2 * MINUTE - 1, want: '1m' },
  { ms: HOUR - 1, want: '59m' },
  { ms: HOUR, want: '1h' },
  { ms: 2 * HOUR - 1, want: '1h' },
  { ms: DAY - 1, want: '23h' },
  { ms: DAY, want: '1d' },
  { ms: 2 * DAY - 1, want: '1d' },
  { ms: YEAR - 1, want: '364d' },
  { ms: YEAR, want: '1y' },
  { ms: 2 * YEAR - 1, want: '1y' },
  { ms: 2 * YEAR, want: '2y' },
];

describe('formatDuration (Kubernetes apimachinery parity)', () => {
  describe('HumanDuration — TestHumanDuration', () => {
    it.each(HUMAN_DURATION_CASES)('HumanDuration %#: $want', ({ ms, want }) => {
      expect(formatDuration(ms, { format: 'mini' })).toBe(want);
    });
  });

  describe('HumanDuration — TestHumanDurationBoundaries', () => {
    it.each(HUMAN_DURATION_BOUNDARY_CASES)('HumanDuration boundary %#: $want', ({ ms, want }) => {
      expect(formatDuration(ms, { format: 'mini' })).toBe(want);
    });
  });

  describe('ShortHumanDuration — TestShortHumanDurationBoundaries', () => {
    it.each(SHORT_HUMAN_DURATION_BOUNDARY_CASES)(
      'ShortHumanDuration boundary %#: $want',
      ({ ms, want }) => {
        expect(formatDuration(ms)).toBe(want);
        expect(formatDuration(ms, { format: 'brief' })).toBe(want);
      }
    );
  });
});

describe('timeAgo', () => {
  it('matches formatDuration for the fixed test clock offset (UNDER_TEST)', () => {
    const start = new Date('2020-06-15T12:00:00.000Z');
    const ninetyDaysMs = 90 * DAY;

    expect(timeAgo(start)).toBe(formatDuration(ninetyDaysMs, {}));
    expect(timeAgo(start, { format: 'mini' })).toBe(
      formatDuration(ninetyDaysMs, { format: 'mini' })
    );
    expect(timeAgo(start)).toBe('90d');
    expect(timeAgo(start, { format: 'mini' })).toBe('90d');
  });
});

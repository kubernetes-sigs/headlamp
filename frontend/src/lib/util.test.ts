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

import {
  combineClusterListErrors,
  compareUnits,
  flattenClusterListItems,
  formatDuration,
  normalizeUnit,
  timeAgo,
} from './util';

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

describe('compareUnits', () => {
  it('should return true for equal quantities with different suffixes', () => {
    expect(compareUnits('1Gi', '1024Mi')).toBe(true);
    expect(compareUnits('1Mi', '1024Ki')).toBe(true);
    expect(compareUnits('1', '1000m')).toBe(true);
  });

  it('should return false for different quantities', () => {
    expect(compareUnits('1Gi', '1Mi')).toBe(false);
    expect(compareUnits('1', '0.5')).toBe(false);
  });

  it('should handle nanocores and microcores', () => {
    expect(compareUnits('1u', '1000n')).toBe(true);
    expect(compareUnits('1m', '1000u')).toBe(true);
  });

  it('should handle decimal CPU values without suffix', () => {
    expect(compareUnits('0.5', '500m')).toBe(true);
    expect(compareUnits('0.5', '0.6')).toBe(false);
  });

  it('should not misclassify memory SI units as CPU', () => {
    // '1M' (memory megabyte) must not be lowercased into '1m' (CPU millicores)
    expect(compareUnits('1M', '1m')).toBe(false);
    expect(compareUnits('1Gi', '1Gi')).toBe(true);
  });

  it('should handle memory decimal SI prefixes including lowercase k', () => {
    expect(compareUnits('1M', '1000k')).toBe(true);
    expect(compareUnits('1G', '1000M')).toBe(true);
    expect(compareUnits('1k', '1000')).toBe(true);
  });

  it('should use resourceType to disambiguate when provided', () => {
    expect(compareUnits('500m', '0.5', 'cpu')).toBe(true);
    expect(compareUnits('1024', '1Ki', 'memory')).toBe(true);
    expect(compareUnits('1.5Gi', '1536Mi', 'memory')).toBe(true);
    expect(compareUnits('1000m', '1', 'memory')).toBe(true);
    expect(compareUnits('1000000u', '1', 'memory')).toBe(true);
    expect(compareUnits('1000000000n', '1', 'memory')).toBe(true);
    expect(compareUnits('2Mi', '2048Ki', 'requests.hugepages-2Mi')).toBe(true);
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

describe('normalizeUnit', () => {
  describe('memory — binary units', () => {
    it('converts Ki (kibibytes)', () => {
      expect(normalizeUnit('memory', '1Ki')).toBe('1.02 KB');
    });

    it('converts Mi (mebibytes)', () => {
      expect(normalizeUnit('memory', '1Mi')).toBe('1.05 MB');
    });

    it('converts Gi (gibibytes)', () => {
      expect(normalizeUnit('memory', '1Gi')).toBe('1.07 GB');
    });

    it('converts Ti (tebibytes)', () => {
      expect(normalizeUnit('memory', '1Ti')).toBe('1.1 TB');
    });

    it('converts Pi (pebibytes)', () => {
      expect(normalizeUnit('memory', '1Pi')).toBe('1.13 PB');
    });

    it('converts Ei (exbibytes)', () => {
      expect(normalizeUnit('memory', '1Ei')).toBe('1.15 EB');
    });
  });

  describe('memory — decimal units', () => {
    it('converts k (kilobytes)', () => {
      expect(normalizeUnit('memory', '1k')).toBe('1 KB');
    });

    it('converts M (megabytes)', () => {
      expect(normalizeUnit('memory', '1M')).toBe('1 MB');
    });

    it('converts G (gigabytes)', () => {
      expect(normalizeUnit('memory', '1G')).toBe('1 GB');
    });

    it('converts T (terabytes)', () => {
      expect(normalizeUnit('memory', '1T')).toBe('1 TB');
    });

    it('converts P (petabytes)', () => {
      expect(normalizeUnit('memory', '1P')).toBe('1 PB');
    });

    it('converts E (exabytes)', () => {
      expect(normalizeUnit('memory', '1E')).toBe('1 EB');
    });
  });

  describe('memory — fractional values', () => {
    it('converts 1.5Gi', () => {
      expect(normalizeUnit('memory', '1.5Gi')).toBe('1.61 GB');
    });

    it('converts 2.3Mi', () => {
      expect(normalizeUnit('memory', '2.3Mi')).toBe('2.41 MB');
    });

    it('converts 0.5k', () => {
      expect(normalizeUnit('memory', '0.5k')).toBe('500 Bytes');
    });

    it('converts 1.25Ti', () => {
      expect(normalizeUnit('memory', '1.25Ti')).toBe('1.37 TB');
    });

    it('converts 3.75G', () => {
      expect(normalizeUnit('memory', '3.75G')).toBe('3.75 GB');
    });
  });

  describe('memory — edge cases', () => {
    it('handles zero bytes', () => {
      expect(normalizeUnit('memory', '0')).toBe('0 Bytes');
    });

    it('handles plain bytes without suffix', () => {
      expect(normalizeUnit('memory', '1024')).toBe('1.02 KB');
    });

    it('handles non-numeric input gracefully', () => {
      expect(normalizeUnit('memory', 'abc')).toBe('abc');
    });

    it('handles empty string gracefully', () => {
      expect(normalizeUnit('memory', '')).toBe('');
    });

    it('returns the original quantity if parsing fails (NaN guard)', () => {
      expect(normalizeUnit('cpu', 'invalid')).toBe('invalid');
      expect(normalizeUnit('memory', 'not-a-number')).toBe('not-a-number');
    });

    it('returns the original quantity for non-finite values (Infinity guard)', () => {
      expect(normalizeUnit('cpu', '1e309')).toBe('1e309');
    });
  });

  describe('cpu', () => {
    it('converts millicores', () => {
      expect(normalizeUnit('cpu', '500m')).toBe('0.5 cores');
    });

    it('shows singular core', () => {
      expect(normalizeUnit('cpu', '1')).toBe('1 core');
    });

    it('shows plural cores', () => {
      expect(normalizeUnit('cpu', '2')).toBe('2 cores');
    });

    it('converts microcores', () => {
      expect(normalizeUnit('cpu', '1000u')).toBe('0.001 cores');
    });

    it('converts nanocores', () => {
      expect(normalizeUnit('cpu', '1000000n')).toBe('0.001 cores');
    });

    it('formats very small nanocores without scientific notation', () => {
      expect(normalizeUnit('cpu', '1n')).toBe('0.000000001 cores');
      expect(normalizeUnit('cpu', '10n')).toBe('0.00000001 cores');
    });
  });
});

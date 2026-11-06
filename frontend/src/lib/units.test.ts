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

import * as fc from 'fast-check';
import {
  divideK8sResources,
  parseCpu,
  parseDiskSpace,
  parseRam,
  unparseCpu,
  unparseRam,
} from './units';

describe('parseRam', () => {
  it('should parse simple numbers', () => {
    expect(parseRam('1000')).toBe(1000);
    expect(parseRam('')).toBe(0);
  });

  it('should parse binary units', () => {
    expect(parseRam('1Ki')).toBe(1024);
    expect(parseRam('1Mi')).toBe(1024 * 1024);
    expect(parseRam('1Gi')).toBe(1024 * 1024 * 1024);
  });

  it('should parse decimal units', () => {
    expect(parseRam('1K')).toBe(1000);
    expect(parseRam('1M')).toBe(1000000);
    expect(parseRam('1G')).toBe(1000000000);
  });

  it('should parse milli-bytes suffix (m)', () => {
    expect(parseRam('1000m')).toBe(1);
    expect(parseRam('11973899059200m')).toBe(11973899059.2);
    expect(parseRam('14712779571200m')).toBe(14712779571.2);
    expect(parseRam('2687146666666m')).toBeCloseTo(2687146666.666, 3);
    expect(parseRam('1.5m')).toBeCloseTo(0.0015, 10);
  });

  it('should parse micro-bytes suffix (u)', () => {
    expect(parseRam('1000000u')).toBe(1);
    expect(parseRam('1000u')).toBe(0.001);
    expect(parseRam('1.5u')).toBeCloseTo(0.0000015, 12);
    expect(parseRam('0u')).toBe(0);
  });

  it('should parse nano-bytes suffix (n)', () => {
    expect(parseRam('1000000000n')).toBe(1);
    expect(parseRam('1000n')).toBe(0.000001);
    expect(parseRam('1.5n')).toBeCloseTo(0.0000000015, 15);
    expect(parseRam('0n')).toBe(0);
  });

  it.each<[string, number]>([
    ['.5m', 0.0005],
    ['.5u', 0.0000005],
    ['.5n', 0.0000000005],
    ['-1u', -0.000001],
    ['+1u', 0.000001],
    ['-.5u', -0.0000005],
    ['+.5m', 0.0005],
    ['1.u', 0.000001],
  ])('should parse fractional byte quantity %s', (quantity, expected) => {
    expect(parseRam(quantity)).toBe(expected);
    expect(parseDiskSpace(quantity)).toBe(expected);
  });

  it('should parse exponential notation', () => {
    expect(parseRam('1e3')).toBe(1000);
    expect(parseRam('1e6')).toBe(1000000);
  });

  it('should parse the lowercase decimal kilo suffix', () => {
    expect(parseRam('1k')).toBe(1000);
    expect(parseRam('64k')).toBe(64000);
    expect(parseRam('1.5k')).toBe(1500);
  });

  it('should not treat the lowercase ki as a binary suffix', () => {
    // Kubernetes binary suffixes are Ki, Mi, Gi and so on. There is no
    // lowercase ki, so it must not be read as 1024.
    expect(parseRam('1ki')).toBe(1);
  });

  it('should parse decimal values with binary units', () => {
    expect(parseRam('1.5Ki')).toBe(1.5 * 1024);
    expect(parseRam('1.5Mi')).toBe(1.5 * 1024 * 1024);
    expect(parseRam('0.5Gi')).toBe(0.5 * 1024 * 1024 * 1024);
    expect(parseRam('289.9Mi')).toBeCloseTo(289.9 * 1024 * 1024, 5);
  });

  it('should parse decimal values with decimal units', () => {
    expect(parseRam('1.5K')).toBe(1500);
    expect(parseRam('2.5M')).toBe(2500000);
    expect(parseRam('0.5G')).toBe(500000000);
  });

  it('should scale binary units by powers of 1024', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), num => {
        const valKibibytes = parseRam(`${num}Ki`);
        const valMebibytes = parseRam(`${num}Mi`);
        const valGibibytes = parseRam(`${num}Gi`);

        // Verify binary scaling (powers of 1024)
        expect(valKibibytes).toBe(num * 1024);
        expect(valMebibytes).toBe(num * 1024 * 1024);
        expect(valGibibytes).toBe(num * 1024 * 1024 * 1024);
      })
    );
  });

  it('should scale decimal units by powers of 1000', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), num => {
        const valKilobytes = parseRam(`${num}K`);
        const valMegabytes = parseRam(`${num}M`);
        const valGigabytes = parseRam(`${num}G`);

        // Verify decimal scaling (powers of 1000)
        expect(valKilobytes).toBe(num * 1000);
        expect(valMegabytes).toBe(num * 1000000);
        expect(valGigabytes).toBe(num * 1000000000);
      })
    );
  });

  it('should always return non-negative values', () => {
    fc.assert(
      fc.property(fc.nat(), fc.constantFrom('', 'K', 'M', 'G', 'Ki', 'Mi', 'Gi'), (num, unit) => {
        const input = `${num}${unit}`;
        const result = parseRam(input);
        expect(result).toBeGreaterThanOrEqual(0);
      })
    );
  });
});

describe('parseDiskSpace', () => {
  it('should use the same fractional byte scaling', () => {
    expect(parseDiskSpace('1000m')).toBe(1);
    expect(parseDiskSpace('1000000u')).toBe(1);
    expect(parseDiskSpace('1000000000n')).toBe(1);
  });
});

describe('unparseRam', () => {
  it('should convert numbers to RAM units', () => {
    expect(unparseRam(1024)).toEqual({
      value: 1,
      unit: 'Ki',
    });

    expect(unparseRam(1024 * 1024)).toEqual({
      value: 1,
      unit: 'Mi',
    });
  });

  it('should handle fractional numbers', () => {
    expect(unparseRam(1536)).toEqual({
      value: 1.5,
      unit: 'Ki',
    });
  });

  it('should use appropriate for small values', () => {
    expect(unparseRam(1)).toEqual({
      value: 1,
      unit: 'Bi',
    });
  });
});

describe('parseCpu', () => {
  it.each<[string, number]>([
    ['1k', 1e12],
    ['2M', 2e15],
    ['3G', 3e18],
    ['4T', 4e21],
    ['5P', 5e24],
    ['6E', 6e27],
    ['0.5k', 5e11],
    ['.5M', 5e14],
    ['+1k', 1e12],
    ['-1k', -1e12],
  ])('should scale decimal SI CPU quantity %s to nanocores', (quantity, expected) => {
    expect(parseCpu(quantity) / expected).toBeCloseTo(1, 12);
  });

  it('should distinguish exa and mega suffixes from exponents and millicores', () => {
    expect(parseCpu('1E')).toBe(1e27);
    expect(parseCpu('1E3')).toBe(1e12);
    expect(parseCpu('1e3')).toBe(1e12);
    expect(parseCpu('1M')).toBe(1e15);
    expect(parseCpu('1m')).toBe(1e6);
  });

  it('should parse CPU units', () => {
    expect(parseCpu('1000n')).toBe(1000);
    expect(parseCpu('1u')).toBe(1000);
    expect(parseCpu('1m')).toBe(1000000);
    expect(parseCpu('1')).toBe(1000000000);
  });

  it('should handle empty input', () => {
    expect(parseCpu('')).toBe(0);
  });

  it('should parse numeric values with units', () => {
    expect(parseCpu('1000n')).toBe(1000);
    expect(parseCpu('1000u')).toBe(1000000);
    expect(parseCpu('1000m')).toBe(1000000000);
  });

  it('should parse numeric values without units', () => {
    expect(parseCpu('1000')).toBe(1000000000000);
  });

  it('should keep the fractional part of decimal-core quantities', () => {
    expect(parseCpu('0.5')).toBe(500000000);
    expect(parseCpu('1.5')).toBe(1500000000);
    expect(parseCpu('2.5')).toBe(2500000000);
  });

  it('should scale correctly between units', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), num => {
        const valNanocores = parseCpu(`${num}n`);
        const valMicrocores = parseCpu(`${num}u`);
        const valMillicores = parseCpu(`${num}m`);
        const valCores = parseCpu(`${num}`);

        // Verify scaling relationships
        expect(valMicrocores).toBe(valNanocores * 1000);
        expect(valMillicores).toBe(valMicrocores * 1000);
        expect(valCores).toBe(valMillicores * 1000);
      })
    );
  });

  it('should always return non-negative values', () => {
    fc.assert(
      fc.property(fc.nat(), fc.constantFrom('n', 'u', 'm', ''), (num, unit) => {
        const input = `${num}${unit}`;
        const result = parseCpu(input);
        expect(result).toBeGreaterThanOrEqual(0);
      })
    );
  });
});

describe('unparseCpu', () => {
  it('should convert CPU values to millicores', () => {
    expect(unparseCpu('500000')).toEqual({ value: 0.5, unit: 'm' });
    expect(unparseCpu('1000000')).toEqual({ value: 1, unit: 'm' });
    expect(unparseCpu('10000000')).toEqual({ value: 10, unit: 'm' });
  });

  it('should round to 2 decimal places', () => {
    expect(unparseCpu('1333333')).toEqual({ value: 1.33, unit: 'm' });
  });
});

describe('divideK8sResources', () => {
  it('should divide CPU quantities with decimal SI suffixes', () => {
    expect(divideK8sResources('500', '1k', 'cpu')).toBe(0.5);
    expect(divideK8sResources('1k', '1000', 'cpu')).toBe(1);
    expect(divideK8sResources('500k', '1M', 'cpu')).toBe(0.5);
  });

  it('should divide two resource quantities with binary units', () => {
    expect(divideK8sResources('1Gi', '1Mi')).toBe(1024);
    expect(divideK8sResources('2Gi', '1Gi')).toBe(2);
    expect(divideK8sResources('1Mi', '1Ki')).toBe(1024);
  });

  it('should handle plain numbers', () => {
    expect(divideK8sResources('1000', '100')).toBe(10);
    expect(divideK8sResources('1', '1')).toBe(1);
  });

  it('should handle decimal units', () => {
    expect(divideK8sResources('1M', '1K')).toBe(1000);
    expect(divideK8sResources('1G', '1M')).toBe(1000);
  });

  it('should handle mixed units', () => {
    // 1Gi = 1073741824 bytes, 1G = 1000000000 bytes
    expect(divideK8sResources('1Gi', '1G')).toBeCloseTo(1.073741824, 5);
  });

  it('should divide memory with milli, micro, and nano byte units', () => {
    expect(divideK8sResources('1000m', '1', 'memory')).toBe(1);
    expect(divideK8sResources('1000u', '1m', 'memory')).toBe(1);
    expect(divideK8sResources('1000n', '1u', 'memory')).toBe(1);
    expect(divideK8sResources('1', '1000m', 'memory')).toBe(1);
  });

  it('should divide fractional memory quantities with leading decimals and signs', () => {
    expect(divideK8sResources('.5u', '1u')).toBe(0.5);
    expect(divideK8sResources('1u', '+.5u')).toBe(2);
    expect(divideK8sResources('-1u', '+1u')).toBe(-1);
  });

  it('should keep memory usage ratios consistent across metric formats', () => {
    const expected = 2687146666.666 / (8 * 1024 ** 3);
    expect(divideK8sResources('2687146666666m', '8Gi')).toBeCloseTo(expected, 10);
    expect(divideK8sResources('2687146666.666', '8Gi')).toBeCloseTo(expected, 10);
  });

  it('should handle CPU units when resourceType is cpu', () => {
    // 500m (millicores) / 1 (core) = 0.5
    expect(divideK8sResources('500m', '1', 'cpu')).toBe(0.5);
    // 1 core / 1m (millicore) = 1000
    expect(divideK8sResources('1', '1m', 'cpu')).toBe(1000);
    // 2 cores / 1 core = 2
    expect(divideK8sResources('2', '1', 'cpu')).toBe(2);
    // 100m / 100m = 1
    expect(divideK8sResources('100m', '100m', 'cpu')).toBe(1);
  });

  it('should handle CPU with nano and micro units', () => {
    // 1000n / 1n = 1000
    expect(divideK8sResources('1000n', '1n', 'cpu')).toBe(1000);
    // 1u / 1n = 1000
    expect(divideK8sResources('1u', '1n', 'cpu')).toBe(1000);
    // 1m / 1u = 1000
    expect(divideK8sResources('1m', '1u', 'cpu')).toBe(1000);
  });

  it('should default to memory parsing when resourceType is not specified', () => {
    // These should still work as before (memory)
    expect(divideK8sResources('1Gi', '1Mi')).toBe(1024);
    expect(divideK8sResources('1M', '1K')).toBe(1000);
  });
});

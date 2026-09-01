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
  compareQuantities,
  divideK8sResources,
  parseCpu,
  parseDiskSpace,
  parseRam,
  splitQuantity,
  unparseCpu,
  unparseRam,
} from './units';

describe('parseRam', () => {
  it('should parse simple numbers', () => {
    expect(parseRam('1000')).toBe(1000);
    expect(parseRam('')).toBe(0);
  });

  it('preserves negative Kubernetes memory quantities', () => {
    expect(parseRam('-1Gi')).toBe(-(1024 ** 3));
    expect(parseRam('-500M')).toBe(-500000000);
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
  it('preserves negative disk quantities', () => {
    expect(parseDiskSpace('-1Gi')).toBe(-(1024 ** 3));
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

  it('should throw an error when divisor is zero or negative', () => {
    expect(() => divideK8sResources('1Gi', '0')).toThrow('Divisor must be greater than 0: 0');
    expect(() => divideK8sResources('1Gi', '0m')).toThrow('Divisor must be greater than 0: 0m');
    expect(() => divideK8sResources('1Gi', '-1Gi')).toThrow('Divisor must be greater than 0: -1Gi');
    expect(() => divideK8sResources('500m', '0', 'cpu')).toThrow(
      'Divisor must be greater than 0: 0'
    );
    expect(() => divideK8sResources('500m', '0m', 'cpu')).toThrow(
      'Divisor must be greater than 0: 0m'
    );
    expect(() => divideK8sResources('500m', '-1', 'cpu')).toThrow(
      'Divisor must be greater than 0: -1'
    );
  });

  it('should throw an error when divisor is empty or invalid', () => {
    expect(() => divideK8sResources('1Gi', '')).toThrow('Divisor must be greater than 0: ');
    expect(() => divideK8sResources('1Gi', 'invalid')).toThrow(
      'Divisor must be greater than 0: invalid'
    );
    expect(() => divideK8sResources('500m', '', 'cpu')).toThrow('Divisor must be greater than 0: ');
    expect(() => divideK8sResources('500m', 'invalid', 'cpu')).toThrow(
      'Divisor must be greater than 0: invalid'
    );
  });
});

describe('splitQuantity', () => {
  it.each([
    ['8Gi', '8', 'Gi'],
    ['500M', '500', 'M'],
    ['1.5Ti', '1.5', 'Ti'],
    ['512Ki', '512', 'Ki'],
    ['100k', '100', 'k'],
    ['500m', '500', 'm'],
    ['500u', '500', 'u'],
    ['500n', '500', 'n'],
  ])('splits %s into its number and its suffix', (quantity, value, unit) => {
    expect(splitQuantity(quantity)).toEqual({ value, unit });
  });

  it('reads a quantity without a suffix', () => {
    expect(splitQuantity('1024')).toEqual({ value: '1024', unit: '' });
  });

  it('keeps every digit of a large quantity', () => {
    expect(splitQuantity('9007199254740993')).toEqual({ value: '9007199254740993', unit: '' });
  });

  it('writes the number as a plain decimal', () => {
    expect(splitQuantity('.5Gi')).toEqual({ value: '0.5', unit: 'Gi' });
    expect(splitQuantity('8.Gi')).toEqual({ value: '8', unit: 'Gi' });
    expect(splitQuantity('008.50Gi')).toEqual({ value: '8.5', unit: 'Gi' });
    expect(splitQuantity('0')).toEqual({ value: '0', unit: '' });
  });

  it('ignores the surrounding space the API may report', () => {
    expect(splitQuantity(' 8Gi ')).toEqual({ value: '8', unit: 'Gi' });
  });

  it('folds a decimal exponent into the decimal suffix it stands for', () => {
    expect(splitQuantity('1e9')).toEqual({ value: '1', unit: 'G' });
    expect(splitQuantity('2E6')).toEqual({ value: '2', unit: 'M' });
    expect(splitQuantity('1.5e3')).toEqual({ value: '1.5', unit: 'k' });
    expect(splitQuantity('5e-6')).toEqual({ value: '5', unit: 'u' });
    expect(splitQuantity('1e0')).toEqual({ value: '1', unit: '' });
  });

  it('folds a decimal exponent without a matching suffix into the number', () => {
    expect(splitQuantity('15e2')).toEqual({ value: '1500', unit: '' });
    expect(splitQuantity('1.55e1')).toEqual({ value: '15.5', unit: '' });
    expect(splitQuantity('15e-4')).toEqual({ value: '0.0015', unit: '' });
  });

  it('reads E as the exa suffix, and only as an exponent when digits follow', () => {
    expect(splitQuantity('1E')).toEqual({ value: '1', unit: 'E' });
    expect(splitQuantity('1E3')).toEqual({ value: '1', unit: 'k' });
  });

  it('gives up on a quantity it cannot read', () => {
    expect(splitQuantity('')).toBeUndefined();
    expect(splitQuantity('Gi')).toBeUndefined();
    expect(splitQuantity('8Gib')).toBeUndefined();
    expect(splitQuantity('8ki')).toBeUndefined();
    // K on its own is not a Kubernetes suffix; kilo is a lowercase k.
    expect(splitQuantity('8K')).toBeUndefined();
    expect(splitQuantity('-16Gi')).toBeUndefined();
    expect(splitQuantity('1e')).toBeUndefined();
    expect(splitQuantity('1e999999999')).toBeUndefined();
  });
});

describe('compareQuantities', () => {
  it.each([
    ['8Gi', '8192Mi'],
    ['1.5Ti', '1536Gi'],
    ['1G', '1e9'],
    ['1500', '15e2'],
    ['1', '1000m'],
    ['1m', '1000u'],
    ['1u', '1000n'],
    ['1Ei', '1152921504606846976'],
    ['0', '0Gi'],
  ])('finds %s equal to %s', (a, b) => {
    expect(compareQuantities(a, b)).toBe(0);
    expect(compareQuantities(b, a)).toBe(0);
  });

  it.each([
    ['900Mi', '8Gi'],
    ['1G', '1Gi'],
    // 2 Ki is smaller than 100 k, so a claim of 100k cannot be "grown" to it.
    ['2Ki', '100k'],
    ['999n', '1u'],
    ['500u', '1m'],
    ['0.1', '0.11'],
    // These two are the same JavaScript number.
    ['9007199254740992', '9007199254740993'],
    ['1Ei', '1152921504606846977'],
  ])('finds %s smaller than %s', (a, b) => {
    expect(compareQuantities(a, b)).toBeLessThan(0);
    expect(compareQuantities(b, a)).toBeGreaterThan(0);
  });

  it('gives up on a quantity it cannot read', () => {
    expect(compareQuantities('', '8Gi')).toBeUndefined();
    expect(compareQuantities('8Gi', '-16Gi')).toBeUndefined();
  });
});

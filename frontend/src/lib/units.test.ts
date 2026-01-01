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
import { parseCpu, parseRam, unparseCpu, unparseRam } from './units';

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

  it('should parse exponential notation', () => {
    expect(parseRam('1e3')).toBe(1000);
    expect(parseRam('1e6')).toBe(1000000);
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

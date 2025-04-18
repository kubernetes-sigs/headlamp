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

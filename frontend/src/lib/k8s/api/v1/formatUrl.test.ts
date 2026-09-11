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
import { asQuery } from './formatUrl';

describe('asQuery', () => {
  it('should omit undefined and null entries but keep valid ones', () => {
    const query = {
      valid: '1',
      empty: '',
      isNull: null,
      isUndefined: undefined,
      numeric: 0,
    };
    // @ts-ignore - testing nullish values passing through
    const result = asQuery(query);
    expect(result).toBe('?valid=1&empty=&numeric=0');
  });

  it('should return empty string if no valid parameters', () => {
    // @ts-ignore
    const result = asQuery({ isNull: null, isUndefined: undefined });
    expect(result).toBe('');
  });

  it('should return empty string if undefined passed', () => {
    expect(asQuery()).toBe('');
  });
});

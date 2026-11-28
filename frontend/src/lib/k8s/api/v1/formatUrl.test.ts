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
  it('returns empty string when queryParams is empty or undefined', () => {
    expect(asQuery()).toBe('');
    expect(asQuery({})).toBe('');
    expect(asQuery({ labelSelector: undefined, continue: undefined })).toBe('');
  });

  it('filters out undefined and null values while keeping valid params', () => {
    expect(asQuery({ labelSelector: undefined, limit: 10 })).toBe('?limit=10');
    expect(asQuery({ labelSelector: 'app=test', dryRun: null as any })).toBe(
      '?labelSelector=app%3Dtest'
    );
    expect(asQuery({ limit: 0, watch: '1' })).toBe('?limit=0&watch=1');
  });
});

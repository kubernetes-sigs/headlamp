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
import { queryClient, shouldRetryQuery } from './queryClient';

describe('queryClient', () => {
  it('keeps the existing query defaults', () => {
    expect(queryClient.getDefaultOptions().queries).toMatchObject({
      staleTime: 3 * 60_000,
      refetchOnWindowFocus: false,
      retry: shouldRetryQuery,
    });
  });
});

describe('shouldRetryQuery', () => {
  it.each([400, 401, 403, 404])('does not immediately retry HTTP %s responses', status => {
    expect(shouldRetryQuery(0, { status })).toBe(false);
  });

  it.each([408, 429, 500])('retries transient HTTP %s responses up to three times', status => {
    expect(shouldRetryQuery(2, { status })).toBe(true);
    expect(shouldRetryQuery(3, { status })).toBe(false);
  });

  it.each([
    null,
    'network error',
    new Error('network error'),
    { message: 'network error' },
    { status: '403' },
    { status: Number.NaN },
  ])('retries errors without a numeric HTTP status up to three times', error => {
    expect(shouldRetryQuery(2, error)).toBe(true);
    expect(shouldRetryQuery(3, error)).toBe(false);
  });

  it('retries responses outside the permanent client-error range', () => {
    expect(shouldRetryQuery(2, { status: 399 })).toBe(true);
    expect(shouldRetryQuery(2, { status: undefined })).toBe(true);
  });
});

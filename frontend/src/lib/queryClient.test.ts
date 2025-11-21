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
import { queryClient } from './queryClient';

function retryQuery(failureCount: number, error: unknown): boolean {
  const retry = queryClient.getDefaultOptions().queries?.retry;
  expect(retry).toBeTypeOf('function');
  return (retry as (failureCount: number, error: unknown) => boolean)(failureCount, error);
}

describe('queryClient', () => {
  it('keeps the existing query defaults', () => {
    expect(queryClient.getDefaultOptions().queries).toMatchObject({
      staleTime: 3 * 60_000,
      refetchOnWindowFocus: false,
    });
  });

  it.each([400, 401, 403, 404])('does not retry HTTP %s responses', status => {
    expect(retryQuery(0, { status })).toBe(false);
  });

  it('keeps the three-attempt limit for server errors', () => {
    expect(retryQuery(2, { status: 500 })).toBe(true);
    expect(retryQuery(3, { status: 500 })).toBe(false);
  });

  it('keeps the three-attempt limit for network errors', () => {
    expect(retryQuery(2, new Error('network error'))).toBe(true);
    expect(retryQuery(3, new Error('network error'))).toBe(false);
  });
});

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

import { QueryClient } from '@tanstack/react-query';

/**
 * Determines whether React Query should retry a failed query.
 *
 * @param failureCount - Number of failed attempts before this retry decision.
 * @param error - The query error, which may include a numeric HTTP `status`.
 * @returns `true` while retries remain for transient errors; `false` for
 * permanent HTTP 4xx errors other than 408 and 429, or after three failures.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const status =
    error !== null &&
    typeof error === 'object' &&
    'status' in error &&
    typeof error.status === 'number' &&
    Number.isFinite(error.status)
      ? error.status
      : undefined;

  if (status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return false;
  }

  return failureCount < 3;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3 * 60_000,
      refetchOnWindowFocus: false,
      retry: shouldRetryQuery,
    },
  },
});

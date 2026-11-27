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

import { describe, expect, it, vi } from 'vitest';
import { parseWarningHeader, publishApiWarnings, subscribeToApiWarnings } from './apiWarnings';

describe('parseWarningHeader', () => {
  it('returns nothing when there is no header', () => {
    expect(parseWarningHeader(null)).toEqual([]);
    expect(parseWarningHeader(undefined)).toEqual([]);
    expect(parseWarningHeader('')).toEqual([]);
  });

  it('parses a deprecated API warning', () => {
    const header =
      '299 - "v1 Endpoints is deprecated in v1.33+; use discovery.k8s.io/v1 EndpointSlice"';

    expect(parseWarningHeader(header)).toEqual([
      'v1 Endpoints is deprecated in v1.33+; use discovery.k8s.io/v1 EndpointSlice',
    ]);
  });

  it('parses a Pod Security warning with escaped quotes', () => {
    const header =
      '299 - "would violate PodSecurity \\"restricted:latest\\": privileged (container \\"c\\" must not set securityContext.privileged=true)"';

    expect(parseWarningHeader(header)).toEqual([
      'would violate PodSecurity "restricted:latest": privileged (container "c" must not set securityContext.privileged=true)',
    ]);
  });

  it('splits several warnings that fetch joined with a comma', () => {
    const header =
      '299 - "unknown field \\"bogusField\\"", 299 - "Validation failed for ValidatingAdmissionPolicy \'require-team\': configmaps must have a team label"';

    expect(parseWarningHeader(header)).toEqual([
      'unknown field "bogusField"',
      "Validation failed for ValidatingAdmissionPolicy 'require-team': configmaps must have a team label",
    ]);
  });

  it('keeps commas that are inside the warning text', () => {
    const header = '299 - "a, b and 299 - c, d", 299 - "second"';

    expect(parseWarningHeader(header)).toEqual(['a, b and 299 - c, d', 'second']);
  });

  it('ignores the optional date', () => {
    const header = '299 - "with a date" "Sat, 24 Oct 2026 10:00:00 GMT"';

    expect(parseWarningHeader(header)).toEqual(['with a date']);
  });

  it('returns a repeated warning once', () => {
    const header = '299 - "same", 299 - "same", 299 - "other"';

    expect(parseWarningHeader(header)).toEqual(['same', 'other']);
  });

  it('ignores values that are not Kubernetes warnings', () => {
    const header = '110 - "Response is Stale", 299 - "real warning"';

    expect(parseWarningHeader(header)).toEqual(['real warning']);
  });

  it('ignores malformed values without throwing', () => {
    expect(parseWarningHeader('not a warning')).toEqual([]);
    expect(parseWarningHeader('299 - unquoted text')).toEqual([]);
    expect(parseWarningHeader('299 - "unterminated')).toEqual([]);
    expect(parseWarningHeader('299 - ""')).toEqual([]);
  });
});

describe('API warnings listeners', () => {
  it('passes published warnings to listeners until they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToApiWarnings(listener);

    publishApiWarnings(['first']);
    unsubscribe();
    publishApiWarnings(['second']);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(['first']);
  });

  it('does not call listeners when there are no warnings', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToApiWarnings(listener);

    publishApiWarnings([]);
    unsubscribe();

    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps calling the other listeners when one throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = vi.fn(() => {
      throw new Error('broken listener');
    });
    const working = vi.fn();
    const unsubscribeBroken = subscribeToApiWarnings(broken);
    const unsubscribeWorking = subscribeToApiWarnings(working);

    publishApiWarnings(['warning']);
    unsubscribeBroken();
    unsubscribeWorking();

    expect(working).toHaveBeenCalledWith(['warning']);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

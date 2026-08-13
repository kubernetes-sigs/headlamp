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

import { makeGlobalSearchListOptions, parseGlobalSearchLabelSelector } from './labelSelectorSearch';

describe('parseGlobalSearchLabelSelector', () => {
  it.each([
    'app=nginx',
    'environment in (production),tier in (frontend)',
    'tier notin (backend)',
    '!partition',
    'generation>2',
  ])('recognizes the explicit selector %s', selector => {
    expect(parseGlobalSearchLabelSelector(selector)).toBe(selector);
  });

  it.each(['nginx', 'partition', 'app in (', 'app=bad value'])('ignores %s', query => {
    expect(parseGlobalSearchLabelSelector(query)).toBeNull();
  });
});

describe('makeGlobalSearchListOptions', () => {
  it('passes the full selector to Kubernetes for every selected-cluster list request', () => {
    const selector = 'environment in (production),tier in (frontend)';

    expect(makeGlobalSearchListOptions(true, selector)).toEqual({
      clusters: undefined,
      fetchAllRequests: true,
      labelSelector: selector,
      limit: 1,
    });
  });

  it('disables resource requests when no cluster is selected', () => {
    expect(makeGlobalSearchListOptions(false, 'app=nginx')).toEqual({
      clusters: [],
      fetchAllRequests: true,
      labelSelector: 'app=nginx',
      limit: 1,
    });
  });

  it('keeps ordinary global search resource requests unchanged', () => {
    expect(makeGlobalSearchListOptions(true, null)).toEqual({ clusters: undefined });
  });
});

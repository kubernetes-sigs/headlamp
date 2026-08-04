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

import { shouldRefreshConfig } from './configRefresh';

describe('shouldRefreshConfig', () => {
  const clusters = {
    test: { name: 'test', server: 'https://example.test', auth_type: '' },
  };

  it('refreshes when websocket mode changes without a cluster change', () => {
    expect(shouldRefreshConfig(clusters, clusters, 'websockets', 'off')).toBe(true);
  });

  it('does not refresh when clusters and websocket mode are unchanged', () => {
    expect(shouldRefreshConfig(clusters, clusters, 'multiplexer', 'multiplexer')).toBe(false);
  });

  it('refreshes when clusters change', () => {
    expect(
      shouldRefreshConfig(
        clusters,
        { ...clusters, other: { name: 'other', auth_type: '' } },
        'off',
        'off'
      )
    ).toBe(true);
  });
});

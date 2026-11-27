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

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EndpointSlice from '../../lib/k8s/endpointSlices';
import { renderEndpoints } from './List';

describe('EndpointSlice list endpoints', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gives every listed endpoint a key, also when addresses repeat', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const endpointSlice = {
      spec: {
        endpoints: [
          { addresses: ['10.0.0.1'] },
          { addresses: ['10.0.0.1'], conditions: { ready: false } },
          { addresses: ['10.0.0.2'] },
        ],
      },
    } as unknown as EndpointSlice;

    render(<>{renderEndpoints(endpointSlice)}</>);

    expect(screen.getAllByText(/^10\.0\.0\./)).toHaveLength(3);
    const warnings = consoleError.mock.calls.filter(call => String(call[0]).includes('key'));
    expect(warnings).toEqual([]);
  });
});

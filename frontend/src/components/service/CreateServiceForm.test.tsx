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

import '../../i18n/config';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// See CreateResourceForm.test.tsx: avoid the lib/k8s barrel cycle.
vi.mock('../../lib/k8s/namespace', () => ({
  default: { useList: () => [[], null] },
}));

const { default: CreateServiceForm } = await import('./CreateServiceForm');

describe('CreateServiceForm', () => {
  describe('External IPs field', () => {
    // Regression: the field used to be fully controlled off value.join(', ').
    // Each keystroke round-tripped through split/trim/filter(Boolean), which
    // swallowed the ',' separator as soon as it was typed and capped the list
    // at one entry.
    it('lets the user type multiple comma-separated IPs', () => {
      let last: Record<string, any> = {};
      function Harness() {
        return (
          <CreateServiceForm
            resource={last}
            onChange={next => {
              last = next;
            }}
          />
        );
      }
      const { getByLabelText, rerender } = render(<Harness />);
      const input = getByLabelText('External IPs') as HTMLInputElement;

      // Simulate a real user: each char is appended to whatever the input
      // currently holds after React has re-synced from state. The old code
      // stripped the trailing ',' on re-render, so appending ' ' next would
      // land on '192.0.2.1 ' with no separator.
      const typed = '192.0.2.1, 192.0.2.2';
      for (const ch of typed) {
        fireEvent.change(input, { target: { value: input.value + ch } });
        rerender(<Harness />);
      }

      expect(input.value).toBe(typed);
      expect(last.spec.externalIPs).toEqual(['192.0.2.1', '192.0.2.2']);
    });

    it('renders an existing externalIPs array joined with ", "', () => {
      const { getByLabelText } = render(
        <CreateServiceForm
          resource={{ spec: { externalIPs: ['10.0.0.1', '10.0.0.2'] } }}
          onChange={() => {}}
        />
      );
      expect((getByLabelText('External IPs') as HTMLInputElement).value).toBe('10.0.0.1, 10.0.0.2');
    });
  });
});

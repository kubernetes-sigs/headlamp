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
import { describe, expect, it } from 'vitest';
import { makeJobStatusLabel } from './List';

// Stub Iconify's Icon with a real DOM element that forwards every prop,
// so the aria-hidden (or a reintroduced aria-label="hidden") attribute we
// pass to it is observable in the rendered output.
vi.mock('@iconify/react', () => ({
  Icon: (props: any) => <span data-testid="job-status-icon" {...props} />,
}));

// makeJobStatusLabel doesn't touch any of these at runtime, but List.tsx
// imports them at module scope, and loading the real Job/ResourceListView/
// common-barrel chain pulls in the full lib/k8s module graph (unrelated to
// this test, and prone to load-order circular-import breakage in isolation).
vi.mock('../../lib/k8s/job', () => ({ default: class Job {} }));
vi.mock('../common', () => ({ CreateResourceButton: () => null }));
vi.mock('../common/Resource/ResourceListView', () => ({ default: () => null }));

function makeJob(conditionType: 'Failed' | 'Complete' | 'Suspended') {
  return {
    status: {
      conditions: [{ type: conditionType, status: 'True' }],
    },
  } as any;
}

describe('makeJobStatusLabel', () => {
  it.each(['Failed', 'Complete', 'Suspended'] as const)(
    'hides the decorative %s status icon from the accessibility tree',
    conditionType => {
      render(<>{makeJobStatusLabel(makeJob(conditionType))}</>);

      const icon = screen.getByTestId('job-status-icon');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon).not.toHaveAttribute('aria-label', 'hidden');

      // The condition text itself must remain in the accessible output.
      expect(screen.getByText(conditionType)).toBeInTheDocument();
    }
  );
});

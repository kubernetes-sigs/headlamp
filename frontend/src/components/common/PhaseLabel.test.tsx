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
import { describe, expect, it, vi } from 'vitest';
import { PhaseLabel } from './PhaseLabel';

vi.mock('./Label', () => ({
  StatusLabel: ({ status, children }: { status: string; children: React.ReactNode }) => (
    <span data-status={status}>{children}</span>
  ),
}));
describe('PhaseLabel', () => {
  it('renders nothing when phase is undefined, null, or empty', () => {
    const { container: c1 } = render(<PhaseLabel phase={undefined} />);
    expect(c1).toBeEmptyDOMElement();

    const { container: c2 } = render(<PhaseLabel phase={null} />);
    expect(c2).toBeEmptyDOMElement();

    const { container: c3 } = render(<PhaseLabel phase="" />);
    expect(c3).toBeEmptyDOMElement();
  });

  it('renders with success status when phase matches default successPhase ("Active")', () => {
    render(<PhaseLabel phase="Active" />);
    expect(screen.getByText('Active')).toHaveAttribute('data-status', 'success');
  });

  it('renders with warning status when phase is in warningPhases', () => {
    render(<PhaseLabel phase="Pending" warningPhases={['Terminating', 'Pending']} />);
    expect(screen.getByText('Pending')).toHaveAttribute('data-status', 'warning');
  });

  it('renders with error status when phase matches neither successPhase nor warningPhases', () => {
    render(<PhaseLabel phase="Terminating" />);
    expect(screen.getByText('Terminating')).toHaveAttribute('data-status', 'error');
  });

  it('supports a custom successPhase', () => {
    render(<PhaseLabel phase="Bound" successPhase="Bound" warningPhases={['Available']} />);
    expect(screen.getByText('Bound')).toHaveAttribute('data-status', 'success');
  });

  it('supports custom warningPhases', () => {
    render(<PhaseLabel phase="Available" successPhase="Bound" warningPhases={['Available']} />);
    expect(screen.getByText('Available')).toHaveAttribute('data-status', 'warning');
  });
});

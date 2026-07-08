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
import { TestContext } from '../../test';
import { ReadyStatusLabel } from './ReadyStatusLabel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|')[1] || key,
  }),
}));

function renderWithContext(ui: React.ReactElement) {
  return render(<TestContext>{ui}</TestContext>);
}

describe('ReadyStatusLabel', () => {
  it('renders the ready label for status True', () => {
    renderWithContext(<ReadyStatusLabel status="True" />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('renders the not-ready label for status False', () => {
    renderWithContext(<ReadyStatusLabel status="False" />);
    expect(screen.getByText('Not Ready')).toBeInTheDocument();
  });

  it('renders the status value as the label when it is an arbitrary non-empty string', () => {
    renderWithContext(<ReadyStatusLabel status="SomeOtherStatus" />);
    expect(screen.getByText('SomeOtherStatus')).toBeInTheDocument();
  });

  it('falls back to the translated Unknown label when status is empty', () => {
    renderWithContext(<ReadyStatusLabel status="" />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders a custom unknownLabel override', () => {
    renderWithContext(<ReadyStatusLabel status="Unknown" unknownLabel="Suspended" />);
    expect(screen.getByText('Suspended')).toBeInTheDocument();
  });

  it('respects custom readyLabel and notReadyLabel', () => {
    const { rerender } = renderWithContext(<ReadyStatusLabel status="True" readyLabel="Active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();

    rerender(
      <TestContext>
        <ReadyStatusLabel status="False" notReadyLabel="Failed" />
      </TestContext>
    );
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });
});

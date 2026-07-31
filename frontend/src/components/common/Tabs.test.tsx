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

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Tabs from './Tabs';

describe('Tabs', () => {
  const tabs = [
    { label: 'First', component: <p>First panel</p> },
    { label: 'Second', component: <p>Second panel</p> },
    { label: 'Third', component: <p>Third panel</p> },
  ];

  it('selects the tab given by defaultIndex on initial render', () => {
    render(<Tabs tabs={tabs} defaultIndex={2} ariaLabel="Test Tabs" />);

    expect(screen.getByRole('tab', { name: 'Third' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'First' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('Third panel')).toBeVisible();
    expect(screen.getByText('First panel')).not.toBeVisible();
  });

  it('defaults to the first tab when defaultIndex is omitted', () => {
    render(<Tabs tabs={tabs} ariaLabel="Test Tabs" />);

    expect(screen.getByRole('tab', { name: 'First' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('First panel')).toBeVisible();
  });

  it('selects no tab when defaultIndex is null', () => {
    render(<Tabs tabs={tabs} defaultIndex={null} ariaLabel="Test Tabs" />);

    expect(screen.getByRole('tab', { name: 'First' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Second' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Third' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('First panel')).not.toBeVisible();
    expect(screen.getByText('Second panel')).not.toBeVisible();
    expect(screen.getByText('Third panel')).not.toBeVisible();
  });

  it('calls onTabChanged when a different tab is selected', () => {
    const onTabChanged = vi.fn();
    render(<Tabs tabs={tabs} defaultIndex={0} onTabChanged={onTabChanged} ariaLabel="Test Tabs" />);

    fireEvent.click(screen.getByRole('tab', { name: 'Second' }));

    expect(onTabChanged).toHaveBeenCalledWith(1);
    expect(screen.getByRole('tab', { name: 'Second' })).toHaveAttribute('aria-selected', 'true');
  });
});

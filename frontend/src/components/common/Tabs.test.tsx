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
import { TestContext } from '../../test';
import Tabs, { TabPanel } from './Tabs';

const mockTabs = [
  { label: 'Tab 1', component: <div data-testid="content-1">Content 1</div> },
  { label: 'Tab 2', component: <div data-testid="content-2">Content 2</div> },
];

describe('Tabs', () => {
  it('renders defaultIndex={1} correctly', () => {
    render(
      <TestContext>
        <Tabs tabs={mockTabs} defaultIndex={1} ariaLabel="Test Tabs" />
      </TestContext>
    );

    const panel1 = screen.getByTestId('content-1').closest('[role="tabpanel"]');
    const panel2 = screen.getByTestId('content-2').closest('[role="tabpanel"]');

    expect(panel1).toHaveAttribute('hidden');
    expect(panel2).not.toHaveAttribute('hidden');
  });

  it('renders defaultIndex={false} correctly', () => {
    render(
      <TestContext>
        <Tabs tabs={mockTabs} defaultIndex={false} ariaLabel="Test Tabs" />
      </TestContext>
    );

    const panel1 = screen.getByTestId('content-1').closest('[role="tabpanel"]');
    const panel2 = screen.getByTestId('content-2').closest('[role="tabpanel"]');

    expect(panel1).toHaveAttribute('hidden');
    expect(panel2).toHaveAttribute('hidden');
  });

  it('renders defaultIndex={null} correctly', () => {
    render(
      <TestContext>
        <Tabs tabs={mockTabs} defaultIndex={null} ariaLabel="Test Tabs" />
      </TestContext>
    );

    const panel1 = screen.getByTestId('content-1').closest('[role="tabpanel"]');
    const panel2 = screen.getByTestId('content-2').closest('[role="tabpanel"]');

    expect(panel1).toHaveAttribute('hidden');
    expect(panel2).toHaveAttribute('hidden');
  });

  it('handles negative defaultIndex by clamping to 0', () => {
    render(
      <TestContext>
        <Tabs tabs={mockTabs} defaultIndex={-1} ariaLabel="Test Tabs" />
      </TestContext>
    );

    const panel1 = screen.getByTestId('content-1').closest('[role="tabpanel"]');
    const panel2 = screen.getByTestId('content-2').closest('[role="tabpanel"]');

    expect(panel1).not.toHaveAttribute('hidden');
    expect(panel2).toHaveAttribute('hidden');
  });

  it('handles updates to defaultIndex correctly in effects', () => {
    const { rerender } = render(
      <TestContext>
        <Tabs tabs={mockTabs} defaultIndex={0} ariaLabel="Test Tabs" />
      </TestContext>
    );

    const panel1 = screen.getByTestId('content-1').closest('[role="tabpanel"]');
    const panel2 = screen.getByTestId('content-2').closest('[role="tabpanel"]');

    expect(panel1).not.toHaveAttribute('hidden');
    expect(panel2).toHaveAttribute('hidden');

    rerender(
      <TestContext>
        <Tabs tabs={mockTabs} defaultIndex={1} ariaLabel="Test Tabs" />
      </TestContext>
    );

    expect(panel1).toHaveAttribute('hidden');
    expect(panel2).not.toHaveAttribute('hidden');

    rerender(
      <TestContext>
        <Tabs tabs={mockTabs} defaultIndex={false} ariaLabel="Test Tabs" />
      </TestContext>
    );

    expect(panel1).toHaveAttribute('hidden');
    expect(panel2).toHaveAttribute('hidden');
  });

  it('renders TabPanel correctly using deprecated tabIndex prop for backwards compatibility', () => {
    render(
      <TestContext>
        <TabPanel tabIndex={0} index={0} id="panel-0" labeledBy="tab-0">
          <div data-testid="panel-content">Content</div>
        </TabPanel>
      </TestContext>
    );

    const panel = screen.getByTestId('panel-content').closest('[role="tabpanel"]');
    expect(panel).not.toHaveAttribute('hidden');
  });

  it('renders TabPanel hidden when tabIndex does not match index', () => {
    render(
      <TestContext>
        <TabPanel tabIndex={0} index={1} id="panel-1" labeledBy="tab-1">
          <div data-testid="panel-content">Content</div>
        </TabPanel>
      </TestContext>
    );

    const panel = screen.getByTestId('panel-content').closest('[role="tabpanel"]');
    expect(panel).toHaveAttribute('hidden');
  });
});

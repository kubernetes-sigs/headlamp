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
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import Tabs from './Tabs';

const THREE_TABS = [
  { label: 'Tab 1', component: <div>Content 1</div> },
  { label: 'Tab 2', component: <div>Content 2</div> },
  { label: 'Tab 3', component: <div>Content 3</div> },
];

describe('Tabs', () => {
  describe('defaultIndex', () => {
    it('selects the first tab when defaultIndex is 0', () => {
      render(
        <TestContext>
          <Tabs defaultIndex={0} tabs={THREE_TABS} ariaLabel="test tabs" />
        </TestContext>
      );
      const [tab1, tab2, tab3] = screen.getAllByRole('tab');
      expect(tab1).toHaveAttribute('aria-selected', 'true');
      expect(tab2).toHaveAttribute('aria-selected', 'false');
      expect(tab3).toHaveAttribute('aria-selected', 'false');
    });

    // Regression test for https://github.com/headlamp-k8s/headlamp/issues/6279.
    // Math.min(2, 0) = 0 caused the wrong tab to be shown on the first render;
    // Math.max(2, 0) = 2 initialises the state correctly so no flash occurs.
    it('selects the correct tab when defaultIndex is a positive non-zero integer', () => {
      const useEffectSpy = vi.spyOn(React, 'useEffect').mockImplementation(() => {});
      try {
        render(
          <TestContext>
            <Tabs defaultIndex={2} tabs={THREE_TABS} ariaLabel="test tabs" />
          </TestContext>
        );
        const [tab1, tab2, tab3] = screen.getAllByRole('tab');
        expect(tab1).toHaveAttribute('aria-selected', 'false');
        expect(tab2).toHaveAttribute('aria-selected', 'false');
        expect(tab3).toHaveAttribute('aria-selected', 'true');
      } finally {
        useEffectSpy.mockRestore();
      }
    });

    it('deselects all tabs and hides all panel content when defaultIndex is null', () => {
      render(
        <TestContext>
          <Tabs defaultIndex={null} tabs={THREE_TABS} ariaLabel="test tabs" />
        </TestContext>
      );
      screen.getAllByRole('tab').forEach(tab => {
        expect(tab).toHaveAttribute('aria-selected', 'false');
      });
      const tabpanels = screen.getAllByRole('tabpanel', { hidden: true });
      expect(tabpanels).toHaveLength(3);
      tabpanels.forEach(panel => {
        expect(panel).toHaveAttribute('hidden');
      });
    });

    it('deselects all tabs and hides all panel content when defaultIndex is false', () => {
      render(
        <TestContext>
          <Tabs defaultIndex={false} tabs={THREE_TABS} ariaLabel="test tabs" />
        </TestContext>
      );
      screen.getAllByRole('tab').forEach(tab => {
        expect(tab).toHaveAttribute('aria-selected', 'false');
      });
      const tabpanels = screen.getAllByRole('tabpanel', { hidden: true });
      expect(tabpanels).toHaveLength(3);
      tabpanels.forEach(panel => {
        expect(panel).toHaveAttribute('hidden');
      });
    });
  });
});

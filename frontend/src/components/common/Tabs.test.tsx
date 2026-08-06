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
import Tabs from './Tabs';

describe('Tabs', () => {
  const tabs = [
    { label: 'Tab 1', component: <p>Content 1</p> },
    { label: 'Tab 2', component: <p>Content 2</p> },
    { label: 'Tab 3', component: <p>Content 3</p> },
  ];

  it('should select defaultIndex tab on initial render (before effects)', () => {
    // Suppress the useEffect that corrects tabIndex post-mount, so the
    // initial useState value is what renders.
    const spy = vi.spyOn(React, 'useEffect').mockImplementation(() => {});
    try {
      render(<Tabs tabs={tabs} defaultIndex={2} ariaLabel="test tabs" />);

      const tabElements = screen.getAllByRole('tab');
      expect(tabElements[0]).toHaveAttribute('aria-selected', 'false');
      expect(tabElements[1]).toHaveAttribute('aria-selected', 'false');
      expect(tabElements[2]).toHaveAttribute('aria-selected', 'true');
    } finally {
      spy.mockRestore();
    }
  });

  it('should render the first tab when defaultIndex is 0', () => {
    render(<Tabs tabs={tabs} defaultIndex={0} ariaLabel="test tabs" />);

    const tabElements = screen.getAllByRole('tab');
    expect(tabElements[0]).toHaveAttribute('aria-selected', 'true');
  });
});

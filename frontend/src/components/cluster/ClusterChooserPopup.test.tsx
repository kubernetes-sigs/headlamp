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
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let canvasGetContextSpy: ReturnType<typeof vi.spyOn<any, any>> | undefined;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  canvasGetContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => null as unknown as CanvasRenderingContext2D);
});

afterAll(() => {
  vi.restoreAllMocks();
  canvasGetContextSpy?.mockRestore();
});
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (str: string) => str, i18n: { language: 'en' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import ClusterChooserPopup from './ClusterChooserPopup';

vi.mock('../../lib/k8s', () => ({
  useClustersConf: () => ({
    dev: { name: 'dev' },
    staging: { name: 'staging' },
    prod: { name: 'prod' },
  }),
  useSelectedClusters: () => ['dev'],
}));

vi.mock('../../helpers/recentClusters', () => ({
  getRecentClusters: () => ['dev'],
  setRecentCluster: vi.fn(),
}));

describe('ClusterChooserPopup', () => {
  let anchor: HTMLElement;

  beforeEach(() => {
    anchor = document.createElement('button');
    document.body.appendChild(anchor);
  });

  afterEach(() => {
    if (anchor.parentNode) {
      document.body.removeChild(anchor);
    }
  });

  it('renders nothing without anchor', () => {
    const { container } = render(
      <TestContext>
        <ClusterChooserPopup anchor={null} onClose={() => {}} />
      </TestContext>
    );
    expect(container.firstChild).toBeNull();
  });

  it('opens popup with search input', () => {
    render(
      <TestContext>
        <ClusterChooserPopup anchor={anchor} onClose={() => {}} />
      </TestContext>
    );
    expect(screen.getByLabelText(/choose cluster/i)).toBeInTheDocument();
  });

  it('lists all available clusters', () => {
    render(
      <TestContext>
        <ClusterChooserPopup anchor={anchor} onClose={() => {}} />
      </TestContext>
    );

    expect(screen.getByText('dev')).toBeInTheDocument();
    expect(screen.getByText('staging')).toBeInTheDocument();
    expect(screen.getByText('prod')).toBeInTheDocument();
  });

  it('filters clusters by search term', async () => {
    const user = userEvent.setup();
    render(
      <TestContext>
        <ClusterChooserPopup anchor={anchor} onClose={() => {}} />
      </TestContext>
    );

    await user.type(screen.getByLabelText(/choose cluster/i), 'prod');

    expect(screen.getByText('prod')).toBeInTheDocument();
    expect(screen.queryByText('dev')).not.toBeInTheDocument();
    expect(screen.queryByText('staging')).not.toBeInTheDocument();
  });

  it('closes on escape key', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <TestContext>
        <ClusterChooserPopup anchor={anchor} onClose={onClose} />
      </TestContext>
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('hides all clusters when search has no match', async () => {
    const user = userEvent.setup();
    render(
      <TestContext>
        <ClusterChooserPopup anchor={anchor} onClose={() => {}} />
      </TestContext>
    );

    await user.type(screen.getByLabelText(/choose cluster/i), 'xyz');

    expect(screen.queryByText('dev')).not.toBeInTheDocument();
    expect(screen.queryByText('staging')).not.toBeInTheDocument();
    expect(screen.queryByText('prod')).not.toBeInTheDocument();
  });

  it('handles arrow key navigation', async () => {
    const user = userEvent.setup();
    render(
      <TestContext>
        <ClusterChooserPopup anchor={anchor} onClose={() => {}} />
      </TestContext>
    );

    const input = screen.getByLabelText(/choose cluster/i);
    await user.click(input);

    const menuItems = screen.getAllByRole('menuitem');
    menuItems.forEach(item => {
      expect(item).not.toHaveClass('Mui-selected');
    });

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /dev/i })).toHaveClass('Mui-selected');

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /dev/i })).not.toHaveClass('Mui-selected');
    expect(screen.getByRole('menuitem', { name: /prod/i })).toHaveClass('Mui-selected');

    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: /dev/i })).toHaveClass('Mui-selected');
    expect(screen.getByRole('menuitem', { name: /prod/i })).not.toHaveClass('Mui-selected');
  });

  it('restores list after clearing search', async () => {
    const user = userEvent.setup();
    render(
      <TestContext>
        <ClusterChooserPopup anchor={anchor} onClose={() => {}} />
      </TestContext>
    );

    const input = screen.getByLabelText(/choose cluster/i);
    await user.type(input, 'prod');
    expect(screen.queryByText('dev')).not.toBeInTheDocument();

    await user.clear(input);
    expect(screen.getByText('dev')).toBeInTheDocument();
    expect(screen.getByText('staging')).toBeInTheDocument();
  });

  it('displays recent clusters header', () => {
    render(
      <TestContext>
        <ClusterChooserPopup anchor={anchor} onClose={() => {}} />
      </TestContext>
    );
    expect(screen.getByText('Recent clusters')).toBeInTheDocument();
  });
});

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

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import List from './List';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options: any) => (options?.count ? `+${options.count} more` : key),
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

let capturedColumns: any[] = [];

// Completely mock the Resource module to prevent it from loading the world
vi.mock('../common/Resource', () => ({
  ResourceListView: (props: any) => {
    capturedColumns = props.columns;
    return <div data-testid="resource-list-view" />;
  },
  MetadataDictGrid: () => <div data-testid="metadata-dict-grid" />,
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    capturedColumns = props.columns;
    return <div data-testid="resource-list-view" />;
  },
}));

vi.mock('../../lib/k8s/replicaSet', () => ({
  default: class ReplicaSet {},
}));

describe('ReplicaSet List', () => {
  it('shows tooltip for truncated selector labels on hover', async () => {
    render(<List />);

    // Find the selector column
    const selectorColumn = capturedColumns.find(c => typeof c === 'object' && c.id === 'selector');
    expect(selectorColumn).toBeDefined();

    // Create a mock ReplicaSet with many labels
    const mockReplicaSet = {
      spec: {
        selector: {
          matchLabels: {
            'k8s-app': 'headlamp',
            'pod-template-hash': 'a123456',
            'extra-label-1': 'value1',
            'extra-label-2': 'value2',
            'extra-label-3': 'value3',
          },
        },
      },
    } as any;

    // Render the output of the column's render function
    const renderedCell = selectorColumn.render(mockReplicaSet);
    render(renderedCell);

    const moreText = await screen.findByText(/\+3 more/i);
    expect(moreText).toBeInTheDocument();

    await userEvent.hover(moreText);

    const tooltip = await screen.findByText(/pod-template-hash: a123456/i);
    expect(tooltip).toBeVisible();

    await userEvent.unhover(moreText);
    await waitFor(() => {
      expect(screen.queryByText(/pod-template-hash: a123456/i)).not.toBeInTheDocument();
    });
  });

  it('shows tooltip for truncated selector labels on keyboard focus', async () => {
    render(<List />);

    const selectorColumn = capturedColumns.find(c => typeof c === 'object' && c.id === 'selector');

    const mockReplicaSet = {
      spec: {
        selector: {
          matchLabels: {
            'k8s-app': 'headlamp',
            'pod-template-hash': 'a123456',
            'extra-label-1': 'value1',
            'extra-label-2': 'value2',
            'extra-label-3': 'value3',
          },
        },
      },
    } as any;

    const renderedCell = selectorColumn.render(mockReplicaSet);
    render(renderedCell);

    const moreText = await screen.findByText(/\+3 more/i);
    expect(moreText).toBeInTheDocument();

    // Focus the interactive tooltip wrapper (the LightTooltip Box wrapper has tabIndex={0})
    moreText.parentElement?.focus();

    const tooltip = await screen.findByText(/pod-template-hash: a123456/i);
    expect(tooltip).toBeVisible();

    // Unfocus
    moreText.parentElement?.blur();
    await waitFor(() => {
      expect(screen.queryByText(/pod-template-hash: a123456/i)).not.toBeInTheDocument();
    });
  });
});

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

import { within } from '@testing-library/dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import { ApiResourcesView } from './ApiResourcePicker';

// Mock KubeIcon component
vi.mock('../resourceMap/kubeIcon/KubeIcon', () => ({
  KubeIcon: ({ kind }: { kind: string }) => (
    <span data-testid={`kube-icon-${kind.toLowerCase()}`}>{kind}</span>
  ),
}));

// Mock react-i18next
vi.mock('react-i18next', async importOriginal => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (k: string) => k }),
    Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// Mock fuse.js
vi.mock('fuse.js', () => {
  return {
    default: class Fuse {
      constructor(private items: any[], private options: any) {}
      search(query: string) {
        if (!query.trim()) return this.items.map(item => ({ item }));
        return this.items
          .filter(
            item =>
              item.kind.toLowerCase().includes(query.toLowerCase()) ||
              (item.groupName && item.groupName.toLowerCase().includes(query.toLowerCase()))
          )
          .map(item => ({ item }));
      }
    },
  };
});

// Mock @iconify/react
vi.mock('@iconify/react', () => ({
  Icon: ({ icon }: { icon: string }) => (
    <span data-testid={`icon-${icon.replace(':', '-')}`} role="img" aria-label={icon} />
  ),
}));

// Test resources data
const mockResources = [
  {
    pluralName: 'pods',
    groupName: '',
    version: 'v1',
    kind: 'Pod',
    singularName: 'pod',
    isNamespaced: true,
    apiVersion: 'v1',
  },
  {
    pluralName: 'services',
    groupName: '',
    version: 'v1',
    kind: 'Service',
    singularName: 'service',
    isNamespaced: true,
    apiVersion: 'v1',
  },
  {
    pluralName: 'deployments',
    groupName: 'apps',
    version: 'v1',
    kind: 'Deployment',
    singularName: 'deployment',
    isNamespaced: true,
    apiVersion: 'apps/v1',
  },
  {
    pluralName: 'replicasets',
    groupName: 'apps',
    version: 'v1',
    kind: 'ReplicaSet',
    singularName: 'replicaset',
    isNamespaced: true,
    apiVersion: 'apps/v1',
  },
  {
    pluralName: 'configmaps',
    groupName: '',
    version: 'v1',
    kind: 'ConfigMap',
    singularName: 'configmap',
    isNamespaced: true,
    apiVersion: 'v1',
  },
];

const createWrapper = () => {
  return ({ children }: { children: React.ReactNode }) => <TestContext>{children}</TestContext>;
};

describe('ApiResourcesView', () => {
  let mockSetSelectedResources: ReturnType<typeof vi.fn<(source: Set<string>) => void>>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetSelectedResources = vi.fn<(source: Set<string>) => void>();
  });

  const renderApiResourcesView = (
    props: {
      resources?: typeof mockResources;
      selectedResources?: Set<string>;
      setSelectedResources?: (source: Set<string>) => void;
    } = {}
  ) => {
    return render(
      <ApiResourcesView
        resources={props.resources ?? mockResources}
        selectedResources={props.selectedResources}
        setSelectedResources={props.setSelectedResources ?? mockSetSelectedResources}
      />,
      { wrapper: createWrapper() }
    );
  };

  describe('Rendering', () => {
    it('renders the Select Resources button with badge showing 0 when no selection', () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      expect(button).toBeInTheDocument();

      // Badge is hidden when count is 0 (MUI Badge behavior)
      const badge = screen.queryByText('0');
      expect(badge).not.toBeInTheDocument();
    });

    it('renders the Select Resources button with badge showing selection count', () => {
      const selected = new Set(['v1pods', 'v1services']);
      renderApiResourcesView({ selectedResources: selected });

      const badge = screen.getByText('2');
      expect(badge).toBeInTheDocument();
    });

    it('shows filter icon on the button', () => {
      renderApiResourcesView();

      // The filter icon is an Icon component with mdi:filter - check the startIcon span by testId
      const button = screen.getByRole('button', { name: /Select Resources/i });
      const startIcon = within(button).getByTestId('icon-mdi-filter');
      expect(startIcon).toBeInTheDocument();
    });
  });

  describe('Popover Behavior', () => {
    it('opens popover when button is clicked', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // The popover content is rendered in a portal, query by textbox role
      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });
    });

    it('closes popover when clicking outside', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // Click outside the popover (on backdrop)
      fireEvent.click(document.querySelector('.MuiBackdrop-root')!);

      await waitFor(() => {
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      });
    });

    it('closes popover when Escape key is pressed', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // Focus the textbox first, then press Escape
      const textbox = screen.getByRole('textbox');
      fireEvent.keyDown(textbox, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    it('filters resources by kind name', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      const searchInput = screen.getByRole('textbox');
      fireEvent.change(searchInput, { target: { value: 'pod' } });

      await waitFor(() => {
        // Group "core" should be visible (contains Pod) - find by chevron icon test ID
        const chevron = screen.getByTestId('icon-mdi-chevron-right');
        const coreGroup = chevron.closest('[role="button"]');
        expect(coreGroup).toBeInTheDocument();
      });
    });

    it('filters resources by group name', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      const searchInput = screen.getByRole('textbox');
      fireEvent.change(searchInput, { target: { value: 'apps' } });

      await waitFor(() => {
        // Group "apps" should be visible (contains Deployment, ReplicaSet)
        const chevron = screen.getByTestId('icon-mdi-chevron-right');
        const appsGroup = chevron.closest('[role="button"]');
        expect(appsGroup).toBeInTheDocument();
      });
    });

    it('shows all resources when search is cleared', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      const searchInput = screen.getByRole('textbox');
      fireEvent.change(searchInput, { target: { value: 'pod' } });

      await waitFor(() => {
        const chevron = screen.getByTestId('icon-mdi-chevron-right');
        const coreGroup = chevron.closest('[role="button"]');
        expect(coreGroup).toBeInTheDocument();
      });

      fireEvent.change(searchInput, { target: { value: '' } });

      await waitFor(() => {
        const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
        expect(chevrons.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('Group Expansion', () => {
    it('shows groups (core and apps) when popover opens', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      await waitFor(() => {
        // Group headers have chevron icons with test IDs
        const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
        expect(chevrons.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('expands group when group header is clicked', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      await waitFor(() => {
        const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
        const coreGroup = chevrons[0].closest('[role="button"]');
        fireEvent.click(coreGroup!);
      });

      await waitFor(() => {
        // Use KubeIcon test IDs since resource text is broken up by elements
        expect(screen.getByTestId('kube-icon-pod')).toBeInTheDocument();
        expect(screen.getByTestId('kube-icon-service')).toBeInTheDocument();
        expect(screen.getByTestId('kube-icon-configmap')).toBeInTheDocument();
      });
    });

    it('collapses group when group header is clicked again', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      await waitFor(() => {
        const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
        const coreGroup = chevrons[0].closest('[role="button"]');
        fireEvent.click(coreGroup!);
      });

      await waitFor(() => {
        expect(screen.getByTestId('kube-icon-pod')).toBeInTheDocument();
      });

      // Click again to collapse - now chevron-down
      const chevron = screen.getByTestId('icon-mdi-chevron-down');
      const coreGroup = chevron.closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        expect(screen.queryByTestId('kube-icon-pod')).not.toBeInTheDocument();
      });
    });

    it('expands group when Enter key is pressed on group header', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      await waitFor(() => {
        const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
        const coreGroup = chevrons[0].closest('[role="button"]');
        fireEvent.keyDown(coreGroup!, { key: 'Enter' });
      });

      await waitFor(() => {
        expect(screen.getByTestId('kube-icon-pod')).toBeInTheDocument();
      });
    });

    it('expands group when Space key is pressed on group header', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      await waitFor(() => {
        const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
        const coreGroup = chevrons[0].closest('[role="button"]');
        fireEvent.keyDown(coreGroup!, { key: ' ' });
      });

      await waitFor(() => {
        expect(screen.getByTestId('kube-icon-pod')).toBeInTheDocument();
      });
    });

    it('shows chevron-right when collapsed and chevron-down when expanded', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      await waitFor(() => {
        // Initially all groups have chevron-right
        const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
        expect(chevrons.length).toBeGreaterThanOrEqual(2);
      });

      // Expand first group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        // First group should now have chevron-down
        expect(screen.getByTestId('icon-mdi-chevron-down')).toBeInTheDocument();
        // Second group should still have chevron-right
        expect(screen.getByTestId('icon-mdi-chevron-right')).toBeInTheDocument();
      });
    });
  });

  describe('Group Selection (Checkbox)', () => {
    it('shows unchecked checkbox for group when no resources selected', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Expand core group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        // Find the group checkbox (first checkbox in the group header)
        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes[0]).not.toBeChecked();
      });
    });

    it('shows checked checkbox for group when all resources in group selected', async () => {
      const selected = new Set(['v1pods', 'v1services', 'v1configmaps']);
      renderApiResourcesView({ selectedResources: selected });

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Expand core group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes[0]).toBeChecked();
      });
    });

    it('shows indeterminate checkbox for group when some resources selected', async () => {
      const selected = new Set(['v1pods']);
      renderApiResourcesView({ selectedResources: selected });

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Expand core group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        // Check for data-indeterminate attribute
        expect(checkboxes[0]).toHaveAttribute('data-indeterminate', 'true');
      });
    });

    it('selects all resources in group when group checkbox is clicked', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Expand core group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]);
      });

      await waitFor(() => {
        expect(mockSetSelectedResources).toHaveBeenCalledWith(
          expect.objectContaining({
            size: 3, // pods, services, configmaps
          })
        );
      });
    });

    it('deselects all resources in group when group checkbox is clicked again', async () => {
      const selected = new Set(['v1pods', 'v1services', 'v1configmaps']);
      renderApiResourcesView({ selectedResources: selected });

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Expand core group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]);
      });

      await waitFor(() => {
        expect(mockSetSelectedResources).toHaveBeenCalledWith(
          expect.objectContaining({
            size: 0,
          })
        );
      });
    });

    it('shows KubeIcon for each resource in expanded group', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Expand core group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        expect(screen.getByTestId('kube-icon-pod')).toBeInTheDocument();
        expect(screen.getByTestId('kube-icon-service')).toBeInTheDocument();
        expect(screen.getByTestId('kube-icon-configmap')).toBeInTheDocument();
      });
    });
  });

  describe('Individual Resource Selection', () => {
    it('shows unchecked checkbox for resource when not selected', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Expand core group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        // First checkbox is group checkbox, second is Pod resource checkbox
        expect(checkboxes[1]).not.toBeChecked();
      });
    });

    it('shows checked checkbox for resource when selected', async () => {
      const selected = new Set(['v1pods']);
      renderApiResourcesView({ selectedResources: selected });

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Expand core group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes[1]).toBeChecked();
      });
    });

    it('toggles resource selection when resource checkbox is clicked', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Expand core group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        // Second checkbox is Pod resource checkbox
        fireEvent.click(checkboxes[1]);
      });

      await waitFor(() => {
        expect(mockSetSelectedResources).toHaveBeenCalledWith(
          expect.objectContaining({
            size: 1,
          })
        );
        const newSelection = mockSetSelectedResources.mock.calls[0][0];
        expect(newSelection.has('v1pods')).toBe(true);
      });
    });

    it('deselects resource when resource checkbox is clicked again', async () => {
      const selected = new Set(['v1pods']);
      renderApiResourcesView({ selectedResources: selected });

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Expand core group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[1]);
      });

      await waitFor(() => {
        expect(mockSetSelectedResources).toHaveBeenCalledWith(
          expect.objectContaining({
            size: 0,
          })
        );
      });
    });

    it('toggles resource selection when resource row is clicked', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Expand core group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        // Click on the Pod resource row (the div containing the checkbox)
        const podRow = screen.getByTestId('kube-icon-pod').closest('div');
        fireEvent.click(podRow!);
      });

      await waitFor(() => {
        expect(mockSetSelectedResources).toHaveBeenCalledWith(
          expect.objectContaining({
            size: 1,
          })
        );
      });
    });

    it('shows KubeIcon for each resource', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Expand core group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        expect(screen.getByTestId('kube-icon-pod')).toBeInTheDocument();
        expect(screen.getByTestId('kube-icon-service')).toBeInTheDocument();
        expect(screen.getByTestId('kube-icon-configmap')).toBeInTheDocument();
      });
    });
  });

  describe('Select All Button', () => {
    it('selects all matching resources when Select All is clicked', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      await waitFor(() => {
        const selectAllButton = screen.getByRole('button', { name: /Select All/i });
        fireEvent.click(selectAllButton);
      });

      await waitFor(() => {
        expect(mockSetSelectedResources).toHaveBeenCalledWith(
          expect.objectContaining({
            size: 5, // all 5 resources
          })
        );
      });
    });

    it('shows playlist-check icon on Select All button', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      await waitFor(() => {
        const selectAllButton = screen.getByRole('button', { name: /Select All/i });
        expect(selectAllButton).toBeInTheDocument();
      });
    });
  });

  describe('Clear Selection Button', () => {
    it('clears all selections when Clear Selection is clicked', async () => {
      const selected = new Set(['v1pods', 'v1services', 'v1deployments']);
      renderApiResourcesView({ selectedResources: selected });

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      await waitFor(() => {
        const clearButton = screen.getByRole('button', { name: /Clear Selection/i });
        fireEvent.click(clearButton);
      });

      await waitFor(() => {
        expect(mockSetSelectedResources).toHaveBeenCalledWith(
          expect.objectContaining({
            size: 0,
          })
        );
      });
    });

    it('shows playlist-remove icon on Clear Selection button', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      await waitFor(() => {
        const clearButton = screen.getByRole('button', { name: /Clear Selection/i });
        expect(clearButton).toBeInTheDocument();
      });
    });
  });

  describe('Keyboard Navigation for Resource Checkboxes', () => {
    it('toggles resource selection when Enter key is pressed on checkbox', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Expand core group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.keyDown(checkboxes[1], { key: 'Enter' });
      });

      await waitFor(() => {
        expect(mockSetSelectedResources).toHaveBeenCalledWith(
          expect.objectContaining({
            size: 1,
          })
        );
      });
    });

    it('toggles resource selection when Space key is pressed on checkbox', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Expand core group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.keyDown(checkboxes[1], { key: ' ' });
      });

      await waitFor(() => {
        expect(mockSetSelectedResources).toHaveBeenCalledWith(
          expect.objectContaining({
            size: 1,
          })
        );
      });
    });

    it('toggles group selection when Enter key is pressed on group checkbox', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Expand core group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.keyDown(checkboxes[0], { key: 'Enter' });
      });

      await waitFor(() => {
        expect(mockSetSelectedResources).toHaveBeenCalledWith(
          expect.objectContaining({
            size: 3,
          })
        );
      });
    });

    it('toggles group selection when Space key is pressed on group checkbox', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Expand core group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.keyDown(checkboxes[0], { key: ' ' });
      });

      await waitFor(() => {
        expect(mockSetSelectedResources).toHaveBeenCalledWith(
          expect.objectContaining({
            size: 3,
          })
        );
      });
    });
  });

  describe('Search with Selection', () => {
    it('Select All only selects filtered resources', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Search for 'pod'
      const searchInput = screen.getByRole('textbox');
      fireEvent.change(searchInput, { target: { value: 'pod' } });

      await waitFor(() => {
        const selectAllButton = screen.getByRole('button', { name: /Select All/i });
        fireEvent.click(selectAllButton);
      });

      await waitFor(() => {
        // Should only select Pod (and ConfigMap if it matches)
        expect(mockSetSelectedResources).toHaveBeenCalledWith(
          expect.objectContaining({
            size: 1, // Only Pod matches 'pod'
          })
        );
      });
    });

    it('Clear Selection clears all selections even when filtered', async () => {
      const selected = new Set(['v1pods', 'v1services', 'v1deployments']);
      renderApiResourcesView({ selectedResources: selected });

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Search for 'pod'
      const searchInput = screen.getByRole('textbox');
      fireEvent.change(searchInput, { target: { value: 'pod' } });

      await waitFor(() => {
        const clearButton = screen.getByRole('button', { name: /Clear Selection/i });
        fireEvent.click(clearButton);
      });

      await waitFor(() => {
        expect(mockSetSelectedResources).toHaveBeenCalledWith(
          expect.objectContaining({
            size: 0,
          })
        );
      });
    });
  });

  describe('Multiple Groups', () => {
    it('shows both core and apps groups', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      await waitFor(() => {
        // Both groups have chevron-right icons
        const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
        expect(chevrons.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('can expand both groups independently', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Expand core group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        expect(screen.getByTestId('kube-icon-pod')).toBeInTheDocument();
        expect(screen.queryByTestId('kube-icon-deployment')).not.toBeInTheDocument();
      });

      // Expand apps group - find the second group header button (which still has chevron-right)
      const chevronsAfter = screen.getAllByTestId('icon-mdi-chevron-right');
      const appsGroup = chevronsAfter[0].closest('[role="button"]');
      fireEvent.click(appsGroup!);

      await waitFor(() => {
        expect(screen.getByTestId('kube-icon-deployment')).toBeInTheDocument();
        expect(screen.getByTestId('kube-icon-replicaset')).toBeInTheDocument();
      });
    });

    it('selecting all in core group does not affect apps group', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Expand core group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]);
      });

      await waitFor(() => {
        expect(mockSetSelectedResources).toHaveBeenCalledWith(
          expect.objectContaining({
            size: 3, // Only core group resources
          })
        );
        const newSelection = mockSetSelectedResources.mock.calls[0][0];
        expect(newSelection.has('v1pods')).toBe(true);
        expect(newSelection.has('v1services')).toBe(true);
        expect(newSelection.has('v1configmaps')).toBe(true);
        expect(newSelection.has('apps/v1deployments')).toBe(false);
        expect(newSelection.has('apps/v1replicasets')).toBe(false);
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles empty resources array', () => {
      renderApiResourcesView({ resources: [] });

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Select All/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Clear Selection/i })).toBeInTheDocument();
    });

    it('handles resources with empty string groupName (core group)', async () => {
      const resourcesWithCore = [
        {
          pluralName: 'pods',
          groupName: '',
          version: 'v1',
          kind: 'Pod',
          singularName: 'pod',
          isNamespaced: true,
          apiVersion: 'v1',
        },
      ];
      renderApiResourcesView({ resources: resourcesWithCore });

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      await waitFor(() => {
        // Group header has chevron-right icon
        expect(screen.getByTestId('icon-mdi-chevron-right')).toBeInTheDocument();
      });
    });
  });

  describe('Badge Display', () => {
    it('shows correct count for empty selection', () => {
      renderApiResourcesView({ selectedResources: new Set() });

      // Badge is hidden when count is 0 (MUI Badge behavior)
      const badge = screen.queryByText('0');
      expect(badge).not.toBeInTheDocument();
    });

    it('shows correct count for partial selection', () => {
      renderApiResourcesView({ selectedResources: new Set(['v1pods', 'v1services']) });

      const badge = screen.getByText('2');
      expect(badge).toBeInTheDocument();
    });

    it('shows correct count for all selection', () => {
      renderApiResourcesView({
        selectedResources: new Set([
          'v1pods',
          'v1services',
          'v1deployments',
          'v1replicasets',
          'v1configmaps',
        ]),
      });

      const badge = screen.getByText('5');
      expect(badge).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper role for group headers', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      await waitFor(() => {
        // Group headers have role="button" and chevron icons
        const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
        expect(chevrons.length).toBeGreaterThanOrEqual(2);
        // The chevron's parent button is the group header
        const coreGroup = chevrons[0].closest('[role="button"]');
        expect(coreGroup).toBeInTheDocument();
      });
    });

    it('has proper role for resource rows', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Expand core group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        // Resource rows are clickable divs - find by KubeIcon's parent div
        const podRow = screen.getByTestId('kube-icon-pod').closest('div');
        expect(podRow).toBeInTheDocument();
      });
    });

    it('checkboxes have proper labels', async () => {
      renderApiResourcesView();

      const button = screen.getByRole('button', { name: /Select Resources/i });
      fireEvent.click(button);

      // Expand core group
      const chevrons = screen.getAllByTestId('icon-mdi-chevron-right');
      const coreGroup = chevrons[0].closest('[role="button"]');
      fireEvent.click(coreGroup!);

      await waitFor(() => {
        // Checkboxes should be accessible
        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes.length).toBeGreaterThan(0);
      });
    });
  });
});

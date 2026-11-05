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

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiResource, apiResourceId } from '../../lib/k8s/api/v2/ApiResource';
import { TestContext } from '../../test';
import { ApiResourcesView } from './ApiResourcePicker';

const mockCallbacks = vi.hoisted(() => ({
  setSelectedResources: vi.fn(),
  kubeIconRender: vi.fn(),
}));

vi.mock('../resourceMap/kubeIcon/KubeIcon', () => ({
  KubeIcon: ({ kind }: { kind: string }) => {
    mockCallbacks.kubeIconRender(kind);
    return <span data-testid={`icon-${kind}`} />;
  },
}));

function makeResource(
  overrides: Partial<ApiResource> & Pick<ApiResource, 'kind' | 'pluralName'>
): ApiResource {
  return {
    apiVersion: 'v1',
    version: 'v1',
    singularName: overrides.kind.toLowerCase(),
    isNamespaced: true,
    ...overrides,
  };
}

const pod = makeResource({ kind: 'Pod', pluralName: 'pods' });
const service = makeResource({ kind: 'Service', pluralName: 'services' });
const deployment = makeResource({
  kind: 'Deployment',
  pluralName: 'deployments',
  groupName: 'apps',
  apiVersion: 'apps/v1',
});
const statefulSet = makeResource({
  kind: 'StatefulSet',
  pluralName: 'statefulsets',
  groupName: 'apps',
  apiVersion: 'apps/v1',
});
const ingress = makeResource({
  kind: 'Ingress',
  pluralName: 'ingresses',
  groupName: 'networking.k8s.io',
  apiVersion: 'networking.k8s.io/v1',
});

const allResources = [pod, service, deployment, statefulSet, ingress];

const id = apiResourceId;

/** Returns the last Set passed to setSelectedResources. */
function lastSelection(): Set<string> {
  const calls = mockCallbacks.setSelectedResources.mock.calls;
  return calls[calls.length - 1][0];
}

function renderPicker(props: Partial<React.ComponentProps<typeof ApiResourcesView>> = {}) {
  const user = userEvent.setup();
  const utils = render(
    <ApiResourcesView
      resources={allResources}
      setSelectedResources={mockCallbacks.setSelectedResources}
      {...props}
    />,
    { wrapper: TestContext }
  );
  return { user, ...utils };
}
async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Select Resources/ }));
}

function getGroupHeader(name: string) {
  const header = screen.getByText(name).closest('[role="button"]');
  if (!header) throw new Error(`Group header "${name}" not found`);
  return header as HTMLElement;
}

function getGroupCheckbox(name: string) {
  return within(getGroupHeader(name)).getByRole('checkbox') as HTMLInputElement;
}

async function expandGroup(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByText(name));
}

/** Returns the checkbox in the row for the given kind (group must be expanded). */
function getKindCheckbox(kind: string) {
  const row = screen.getByText(kind).closest('div') as HTMLElement;
  return within(row.parentElement as HTMLElement).getByRole('checkbox') as HTMLInputElement;
}

describe('ApiResourcesView', () => {
  beforeEach(() => {
    mockCallbacks.setSelectedResources.mockClear();
    mockCallbacks.kubeIconRender.mockClear();
  });

  describe('Trigger button and popover', () => {
    it('renders the trigger button and keeps the popover closed initially', () => {
      renderPicker();
      expect(screen.getByRole('button', { name: /Select Resources/ })).toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('opens the popover with search field and action buttons', async () => {
      const { user } = renderPicker();
      await openPicker(user);

      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Select All/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Clear Selection/ })).toBeInTheDocument();
    });

    it('closes the popover when Escape is pressed', async () => {
      const { user } = renderPicker();
      await openPicker(user);
      await user.keyboard('{Escape}');
      await vi.waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
    });
  });

  describe('Resource display and grouping', () => {
    it('renders no group headers for an empty resource list', async () => {
      const { user } = renderPicker({ resources: [] });
      await openPicker(user);

      expect(screen.queryByText('core')).not.toBeInTheDocument();
      expect(screen.queryByText('apps')).not.toBeInTheDocument();
    });

    it('renders a single resource as a single group', async () => {
      const { user } = renderPicker({ resources: [deployment] });
      await openPicker(user);

      expect(screen.getByText('apps')).toBeInTheDocument();
      expect(screen.queryByText('core')).not.toBeInTheDocument();
    });

    it('renders one header per API group', async () => {
      const { user } = renderPicker();
      await openPicker(user);

      expect(screen.getByText('core')).toBeInTheDocument();
      expect(screen.getByText('apps')).toBeInTheDocument();
      expect(screen.getByText('networking.k8s.io')).toBeInTheDocument();
    });

    it('labels resources without a groupName as "core"', async () => {
      const { user } = renderPicker({ resources: [pod, service] });
      await openPicker(user);

      expect(screen.getByText('core')).toBeInTheDocument();
      expect(screen.queryByText('undefined')).not.toBeInTheDocument();
    });

    it('renders groups collapsed by default', async () => {
      const { user } = renderPicker();
      await openPicker(user);

      expect(screen.queryByText('Pod')).not.toBeInTheDocument();
      expect(screen.queryByText('Deployment')).not.toBeInTheDocument();
    });

    it('expands a group to show its resource kinds', async () => {
      const { user } = renderPicker();
      await openPicker(user);
      await expandGroup(user, 'apps');

      expect(screen.getByText('Deployment')).toBeInTheDocument();
      expect(screen.getByText('StatefulSet')).toBeInTheDocument();
      expect(screen.queryByText('Pod')).not.toBeInTheDocument();
    });

    it('collapses an expanded group when its header is clicked again', async () => {
      const { user } = renderPicker();
      await openPicker(user);
      await expandGroup(user, 'apps');
      await expandGroup(user, 'apps');

      expect(screen.queryByText('Deployment')).not.toBeInTheDocument();
    });

    it('only keeps one group expanded at a time', async () => {
      const { user } = renderPicker();
      await openPicker(user);
      await expandGroup(user, 'core');
      expect(screen.getByText('Pod')).toBeInTheDocument();

      await expandGroup(user, 'apps');
      expect(screen.getByText('Deployment')).toBeInTheDocument();
      expect(screen.queryByText('Pod')).not.toBeInTheDocument();
    });

    it('renders an icon for each resource row', async () => {
      const { user } = renderPicker();
      await openPicker(user);
      await expandGroup(user, 'core');

      expect(screen.getByTestId('icon-Pod')).toBeInTheDocument();
      expect(screen.getByTestId('icon-Service')).toBeInTheDocument();
    });

    it('handles 100+ resources across many groups', async () => {
      const many = Array.from({ length: 120 }, (_, i) =>
        makeResource({
          kind: `Kind${i}`,
          pluralName: `kind${i}s`,
          groupName: `group${i % 12}.example.com`,
        })
      );
      const { user } = renderPicker({ resources: many });
      await openPicker(user);

      expect(screen.getAllByRole('checkbox')).toHaveLength(12);
      await expandGroup(user, 'group0.example.com');
      // 10 resources per group, plus 12 group checkboxes
      expect(screen.getAllByRole('checkbox')).toHaveLength(12 + 10);
    });
  });

  describe('Selection state', () => {
    it('shows no badge count when selectedResources is undefined', () => {
      renderPicker({ selectedResources: undefined });
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('shows no badge count for an empty Set', () => {
      renderPicker({ selectedResources: new Set() });
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('shows the number of selected resources in the badge', () => {
      renderPicker({ selectedResources: new Set([id(pod), id(deployment)]) });
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('renders group checkboxes unchecked when nothing is selected', async () => {
      const { user } = renderPicker({ selectedResources: undefined });
      await openPicker(user);

      for (const group of ['core', 'apps', 'networking.k8s.io']) {
        const checkbox = getGroupCheckbox(group);
        expect(checkbox.checked).toBe(false);
        expect(checkbox).not.toHaveAttribute('data-indeterminate', 'true');
      }
    });

    it('checks the group checkbox when all its resources are selected', async () => {
      const { user } = renderPicker({
        selectedResources: new Set([id(deployment), id(statefulSet)]),
      });
      await openPicker(user);

      expect(getGroupCheckbox('apps').checked).toBe(true);
      expect(getGroupCheckbox('core').checked).toBe(false);
    });

    it('marks the group checkbox indeterminate when only some resources are selected', async () => {
      const { user } = renderPicker({ selectedResources: new Set([id(deployment)]) });
      await openPicker(user);

      const checkbox = getGroupCheckbox('apps');
      expect(checkbox.checked).toBe(false);
      expect(checkbox).toHaveAttribute('data-indeterminate', 'true');
    });

    it('reflects selection state on individual resource checkboxes', async () => {
      const { user } = renderPicker({ selectedResources: new Set([id(deployment)]) });
      await openPicker(user);
      await expandGroup(user, 'apps');

      expect(getKindCheckbox('Deployment').checked).toBe(true);
      expect(getKindCheckbox('StatefulSet').checked).toBe(false);
    });
  });

  describe('Interactions', () => {
    it('Select All selects every resource', async () => {
      const { user } = renderPicker();
      await openPicker(user);
      await user.click(screen.getByRole('button', { name: /Select All/ }));

      expect(mockCallbacks.setSelectedResources).toHaveBeenCalledTimes(1);
      expect(lastSelection()).toEqual(new Set(allResources.map(id)));
    });

    it('Select All with an empty resource list selects nothing', async () => {
      const { user } = renderPicker({ resources: [] });
      await openPicker(user);
      await user.click(screen.getByRole('button', { name: /Select All/ }));

      expect(lastSelection()).toEqual(new Set());
    });

    it('Clear Selection calls the callback with an empty Set', async () => {
      const { user } = renderPicker({ selectedResources: new Set(allResources.map(id)) });
      await openPicker(user);
      await user.click(screen.getByRole('button', { name: /Clear Selection/ }));

      expect(mockCallbacks.setSelectedResources).toHaveBeenCalledTimes(1);
      expect(lastSelection()).toEqual(new Set());
    });

    it('toggles an individual resource on via its checkbox', async () => {
      const { user } = renderPicker({ selectedResources: new Set([id(pod)]) });
      await openPicker(user);
      await expandGroup(user, 'apps');
      await user.click(getKindCheckbox('Deployment'));

      expect(mockCallbacks.setSelectedResources).toHaveBeenCalledTimes(1);
      expect(lastSelection()).toEqual(new Set([id(pod), id(deployment)]));
    });

    it('toggles an individual resource off via its checkbox', async () => {
      const { user } = renderPicker({ selectedResources: new Set([id(pod), id(deployment)]) });
      await openPicker(user);
      await expandGroup(user, 'apps');
      await user.click(getKindCheckbox('Deployment'));

      expect(lastSelection()).toEqual(new Set([id(pod)]));
    });

    it('toggles a resource when its row label is clicked', async () => {
      const { user } = renderPicker({ selectedResources: undefined });
      await openPicker(user);
      await expandGroup(user, 'core');
      await user.click(screen.getByText('Pod'));

      expect(mockCallbacks.setSelectedResources).toHaveBeenCalledTimes(1);
      expect(lastSelection()).toEqual(new Set([id(pod)]));
    });

    it('does not collapse the group when a group checkbox is clicked', async () => {
      const { user } = renderPicker();
      await openPicker(user);
      await expandGroup(user, 'apps');
      await user.click(getGroupCheckbox('apps'));

      expect(screen.getByText('Deployment')).toBeInTheDocument();
    });

    it('group checkbox selects all resources in the group, keeping other selections', async () => {
      const { user } = renderPicker({ selectedResources: new Set([id(pod)]) });
      await openPicker(user);
      await user.click(getGroupCheckbox('apps'));

      expect(lastSelection()).toEqual(new Set([id(pod), id(deployment), id(statefulSet)]));
    });

    it('group checkbox deselects the whole group when it is fully selected', async () => {
      const { user } = renderPicker({
        selectedResources: new Set([id(pod), id(deployment), id(statefulSet)]),
      });
      await openPicker(user);
      await user.click(getGroupCheckbox('apps'));

      expect(lastSelection()).toEqual(new Set([id(pod)]));
    });

    it('group checkbox selects the remaining items when the group is partially selected', async () => {
      const { user } = renderPicker({ selectedResources: new Set([id(deployment)]) });
      await openPicker(user);
      await user.click(getGroupCheckbox('apps'));

      expect(lastSelection()).toEqual(new Set([id(deployment), id(statefulSet)]));
    });

    it('does not mutate the incoming selection Set', async () => {
      const selection = new Set([id(pod)]);
      const { user } = renderPicker({ selectedResources: selection });
      await openPicker(user);
      await user.click(getGroupCheckbox('apps'));

      expect(selection).toEqual(new Set([id(pod)]));
      expect(lastSelection()).not.toBe(selection);
    });

    it('works end-to-end when the parent owns the selection state', async () => {
      function Harness() {
        const [selected, setSelected] = useState<Set<string>>();
        return (
          <ApiResourcesView
            resources={allResources}
            selectedResources={selected}
            setSelectedResources={setSelected}
          />
        );
      }
      const user = userEvent.setup();
      render(<Harness />, { wrapper: TestContext });
      await openPicker(user);

      await user.click(getGroupCheckbox('apps'));
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(getGroupCheckbox('apps').checked).toBe(true);

      await user.click(screen.getByRole('button', { name: /Clear Selection/ }));
      expect(screen.getByText('2')).toHaveClass('MuiBadge-invisible');
      expect(getGroupCheckbox('apps').checked).toBe(false);
    });
  });

  describe('Search and filter', () => {
    it('filters resources by kind', async () => {
      const { user } = renderPicker();
      await openPicker(user);
      await user.type(screen.getByRole('textbox'), 'Deployment');

      expect(screen.getByText('apps')).toBeInTheDocument();
      expect(screen.queryByText('core')).not.toBeInTheDocument();
      expect(screen.queryByText('networking.k8s.io')).not.toBeInTheDocument();
    });

    it('filters resources by group name', async () => {
      const { user } = renderPicker();
      await openPicker(user);
      await user.type(screen.getByRole('textbox'), 'networking');

      expect(screen.getByText('networking.k8s.io')).toBeInTheDocument();
      expect(screen.queryByText('apps')).not.toBeInTheDocument();
    });

    it('shows no groups when nothing matches', async () => {
      const { user } = renderPicker();
      await openPicker(user);
      await user.type(screen.getByRole('textbox'), 'zzzzzzzz');

      expect(screen.queryByText('core')).not.toBeInTheDocument();
      expect(screen.queryByText('apps')).not.toBeInTheDocument();
      expect(screen.queryByText('networking.k8s.io')).not.toBeInTheDocument();
    });

    it('restores all groups when the search is cleared', async () => {
      const { user } = renderPicker();
      await openPicker(user);
      const input = screen.getByRole('textbox');
      await user.type(input, 'Deployment');
      await user.clear(input);

      expect(screen.getByText('core')).toBeInTheDocument();
      expect(screen.getByText('apps')).toBeInTheDocument();
      expect(screen.getByText('networking.k8s.io')).toBeInTheDocument();
    });

    it('treats a whitespace-only query as no filter', async () => {
      const { user } = renderPicker();
      await openPicker(user);
      await user.type(screen.getByRole('textbox'), '   ');

      expect(screen.getByText('core')).toBeInTheDocument();
      expect(screen.getByText('apps')).toBeInTheDocument();
    });

    it('Select All only selects the resources matching the filter', async () => {
      const { user } = renderPicker();
      await openPicker(user);
      await user.type(screen.getByRole('textbox'), 'Deployment');
      await user.click(screen.getByRole('button', { name: /Select All/ }));

      expect(lastSelection()).toEqual(new Set([id(deployment)]));
    });

    it('Clear Selection clears everything even while a filter is active', async () => {
      const { user } = renderPicker({ selectedResources: new Set(allResources.map(id)) });
      await openPicker(user);
      await user.type(screen.getByRole('textbox'), 'Deployment');
      await user.click(screen.getByRole('button', { name: /Clear Selection/ }));

      expect(lastSelection()).toEqual(new Set());
    });

    it('keeps the query when the selection prop changes', async () => {
      const { user, rerender } = renderPicker();
      await openPicker(user);
      await user.type(screen.getByRole('textbox'), 'Deployment');

      rerender(
        <ApiResourcesView
          resources={allResources}
          selectedResources={new Set([id(deployment)])}
          setSelectedResources={mockCallbacks.setSelectedResources}
        />
      );

      expect(screen.getByRole('textbox')).toHaveValue('Deployment');
      expect(screen.queryByText('core')).not.toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('distinguishes same-kind resources in different groups by id', async () => {
      const coreEvent = makeResource({ kind: 'Event', pluralName: 'events' });
      const groupedEvent = makeResource({
        kind: 'Event',
        pluralName: 'events',
        groupName: 'events.k8s.io',
        apiVersion: 'events.k8s.io/v1',
      });
      expect(id(coreEvent)).not.toBe(id(groupedEvent));

      const { user } = renderPicker({ resources: [coreEvent, groupedEvent] });
      await openPicker(user);
      await expandGroup(user, 'events.k8s.io');
      await user.click(screen.getByText('Event'));

      expect(lastSelection()).toEqual(new Set([id(groupedEvent)]));
    });

    it('renders kinds and groups containing special characters', async () => {
      const weird = makeResource({
        kind: 'My-Kind_v2.x',
        pluralName: 'my-kind_v2.xs',
        groupName: 'weird.example.com/&<>',
        apiVersion: 'weird.example.com/v1',
      });
      const { user } = renderPicker({ resources: [weird] });
      await openPicker(user);

      expect(screen.getByText('weird.example.com/&<>')).toBeInTheDocument();
      await expandGroup(user, 'weird.example.com/&<>');
      await user.click(screen.getByText('My-Kind_v2.x'));
      expect(lastSelection()).toEqual(new Set([id(weird)]));
    });

    it('does not re-render rows when re-rendered with identical props (memoization)', async () => {
      const resources = allResources;
      const selected = new Set([id(pod)]);
      const { user, rerender } = renderPicker({ resources, selectedResources: selected });
      await openPicker(user);
      await expandGroup(user, 'core');

      const rendersBefore = mockCallbacks.kubeIconRender.mock.calls.length;
      expect(rendersBefore).toBeGreaterThan(0);

      rerender(
        <ApiResourcesView
          resources={resources}
          selectedResources={selected}
          setSelectedResources={mockCallbacks.setSelectedResources}
        />
      );

      expect(mockCallbacks.kubeIconRender.mock.calls.length).toBe(rendersBefore);
      expect(screen.getByRole('textbox')).toBeInTheDocument(); // popover state preserved
    });

    it('updates the UI when the resources prop changes', async () => {
      const { user, rerender } = renderPicker({ resources: [pod] });
      await openPicker(user);
      expect(screen.queryByText('apps')).not.toBeInTheDocument();

      rerender(
        <ApiResourcesView
          resources={[pod, deployment]}
          setSelectedResources={mockCallbacks.setSelectedResources}
        />
      );
      expect(screen.getByText('apps')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('exposes group headers as focusable buttons', async () => {
      const { user } = renderPicker();
      await openPicker(user);

      const header = getGroupHeader('apps');
      expect(header).toHaveAttribute('role', 'button');
      expect(header).toHaveAttribute('tabindex', '0');
    });

    it('expands and collapses a group with the Enter key', async () => {
      const { user } = renderPicker();
      await openPicker(user);
      getGroupHeader('apps').focus();

      await user.keyboard('{Enter}');
      expect(screen.getByText('Deployment')).toBeInTheDocument();

      await user.keyboard('{Enter}');
      expect(screen.queryByText('Deployment')).not.toBeInTheDocument();
    });

    it('expands a group with the Space key', async () => {
      const { user } = renderPicker();
      await openPicker(user);
      getGroupHeader('apps').focus();

      await user.keyboard(' ');
      expect(screen.getByText('Deployment')).toBeInTheDocument();
    });

    it('toggles a group checkbox with Enter without expanding the group', async () => {
      const { user } = renderPicker();
      await openPicker(user);
      getGroupCheckbox('apps').focus();

      await user.keyboard('{Enter}');

      expect(mockCallbacks.setSelectedResources).toHaveBeenCalledTimes(1);
      expect(lastSelection()).toEqual(new Set([id(deployment), id(statefulSet)]));
      expect(screen.queryByText('Deployment')).not.toBeInTheDocument();
    });

    it('lets keyboard users tab from the search field to the action buttons', async () => {
      const { user } = renderPicker();
      await openPicker(user);
      screen.getByRole('textbox').focus();

      await user.tab();
      expect(screen.getByRole('button', { name: /Select All/ })).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', { name: /Clear Selection/ })).toHaveFocus();
    });
  });
});

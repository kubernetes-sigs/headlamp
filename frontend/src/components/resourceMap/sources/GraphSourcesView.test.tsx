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

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { GraphSource } from '../graph/graphModel';
import { GraphSourcesView } from './GraphSourcesView';

const leaf = (id: string, label: string): GraphSource => ({
  id,
  label,
  icon: <span>{id}-icon</span>,
  useData: () => null,
});

const pods = leaf('pods', 'Pods');
const deployments = leaf('deployments', 'Deployments');
const services = leaf('services', 'Services');
const workloads: GraphSource = {
  id: 'workloads',
  label: 'Workloads',
  icon: <span>workloads-icon</span>,
  sources: [pods, deployments],
};

describe('GraphSourcesView', () => {
  it('summarizes selected groups and leaves, including overflow', () => {
    const { rerender } = render(
      <GraphSourcesView
        sources={[workloads, services, leaf('configmaps', 'ConfigMaps')]}
        sourceData={new Map()}
        selectedSources={new Set(['pods', 'services', 'configmaps'])}
        toggleSource={vi.fn()}
      />
    );

    expect(screen.getByText(/Workloads, Services, \+1/)).toBeInTheDocument();

    rerender(
      <GraphSourcesView
        sources={[workloads, services]}
        sourceData={new Map()}
        selectedSources={new Set(['pods', 'services'])}
        toggleSource={vi.fn()}
      />
    );

    expect(screen.getByText(/Workloads, Services/)).toBeInTheDocument();
  });

  it('renders group and leaf selection, loading, and loaded counts', () => {
    const { rerender } = render(
      <GraphSourcesView
        sources={[workloads]}
        sourceData={new Map([['pods', { nodes: [{ id: 'pod-1' }, { id: 'pod-2' }] }]])}
        selectedSources={new Set(['pods'])}
        toggleSource={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    const popover = screen.getByRole('presentation');
    fireEvent.click(within(popover).getByRole('button'));

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[0]).toHaveAttribute('data-indeterminate', 'true');
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[2]).not.toBeChecked();
    expect(screen.getByText('2')).toBeInTheDocument();

    rerender(
      <GraphSourcesView
        sources={[workloads]}
        sourceData={new Map()}
        selectedSources={new Set(['deployments'])}
        toggleSource={vi.fn()}
      />
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('toggles leaves and groups through click and keyboard paths', () => {
    const toggleSource = vi.fn();
    render(
      <GraphSourcesView
        sources={[workloads, services]}
        sourceData={new Map()}
        selectedSources={new Set(['pods', 'deployments'])}
        toggleSource={toggleSource}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    const popover = screen.getByRole('presentation');
    const groupButton = within(popover).getByRole('button');
    fireEvent.click(groupButton);
    fireEvent.keyDown(groupButton, { key: ' ' });
    expect(screen.queryByText('Pods')).not.toBeInTheDocument();

    fireEvent.keyDown(groupButton, { key: 'Enter' });
    fireEvent.keyDown(screen.getByText('Pods').closest('div')!.querySelector('input')!, {
      key: 'Enter',
    });
    fireEvent.click(screen.getByText('Services'));
    fireEvent.click(screen.getAllByRole('checkbox')[0]);

    expect(toggleSource).toHaveBeenNthCalledWith(1, pods);
    expect(toggleSource).toHaveBeenNthCalledWith(2, services);
    expect(toggleSource).toHaveBeenNthCalledWith(3, workloads);
  });

  it('opens and closes the source popover', async () => {
    render(
      <GraphSourcesView
        sources={[services]}
        sourceData={new Map()}
        selectedSources={new Set()}
        toggleSource={vi.fn()}
      />
    );

    const chip = screen.getByRole('button');
    fireEvent.click(chip);
    expect(screen.getByText('Services')).toBeVisible();

    fireEvent.click(document.querySelector('.MuiBackdrop-root')!);

    await waitFor(() => expect(screen.queryByText('Services')).not.toBeInTheDocument());
  });
});

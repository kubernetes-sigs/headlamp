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

/**
 * Filtering and grouping clusters by their local tags, rendered with the real Table so the
 * grouped rows come out of material-react-table's row models.
 */

import { ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storeClusterSettings } from '../../../helpers/clusterSettings';
import { ClusterTags } from '../../../helpers/clusterTags';
import { Cluster } from '../../../lib/k8s/cluster';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';
import ClusterTable, { ClusterTableProps } from './ClusterTable';
import { CLUSTERS, CLUSTERS_BY_NAME, VERSIONS, WARNING_LABELS } from './storyHelper';

vi.mock('react-i18next', async importOriginal => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, values?: Record<string, unknown>) =>
        (key.split('|').pop() ?? key).replace(/{{\s*(\w+)\s*}}/g, (_match, name) =>
          String(values?.[name])
        ),
      i18n: { language: 'en', resolvedLanguage: 'en' },
    }),
  };
});

const theme = createMuiTheme({ name: 'light', base: 'light' });

const TAGS: Record<string, ClusterTags> = {
  'aks-prod': { environment: 'production', region: 'eu-west' },
  'in-cluster': { environment: 'staging' },
  'plugin-cluster': { environment: 'production', region: 'us-east' },
};

function setTags(tags: Record<string, ClusterTags>) {
  for (const [cluster, clusterTags] of Object.entries(tags)) {
    storeClusterSettings(cluster, { tags: clusterTags });
  }
}

function renderTable(clusters: Cluster[] = CLUSTERS) {
  return render(
    <ThemeProvider theme={theme}>
      <TestContext>
        <ClusterTable
          customNameClusters={clusters}
          clusters={Object.fromEntries(clusters.map(cluster => [cluster.name, cluster]))}
          versions={VERSIONS}
          errors={Object.fromEntries(clusters.map(cluster => [cluster.name, null]))}
          warningLabels={WARNING_LABELS}
          connectedClusterNames={new Set(clusters.map(cluster => cluster.name))}
          onConnectCluster={() => {}}
        />
      </TestContext>
    </ThemeProvider>
  );
}

/** Stable, like the connected set the Home page passes; a new set would rebuild the rows. */
const ALL_CONNECTED = new Set(CLUSTERS.map(cluster => cluster.name));

// Longest first, since "plugin-cluster" also contains "in-cluster".
const NAMES_LONGEST_FIRST = CLUSTERS.map(cluster => cluster.name).sort(
  (a, b) => b.length - a.length
);

/** The body row showing the given cluster. */
function clusterRow(name: string) {
  return screen
    .getAllByRole('row')
    .find(
      row =>
        row.closest('tbody') &&
        NAMES_LONGEST_FIRST.find(candidate => row.textContent?.includes(candidate)) === name
    )!;
}

/** The cluster names and group headings in the table body, in order. */
function bodyEntries() {
  const names = NAMES_LONGEST_FIRST;
  return screen
    .getAllByRole('row')
    .filter(row => row.closest('tbody'))
    .map(row => {
      const groupToggle = row.querySelector('button[aria-expanded]');
      if (groupToggle) {
        return `[${groupToggle.textContent}]`;
      }
      return names.find(name => row.textContent?.includes(name)) ?? '';
    });
}

describe('ClusterTable tags', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('does not show label controls or the tags column when no cluster has tags', () => {
    renderTable();

    expect(screen.queryByLabelText('Group by tag')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Tags/ })).not.toBeInTheDocument();
    expect(bodyEntries()).toEqual(['aks-prod', 'in-cluster', 'plugin-cluster', 'spoke-a']);
  });

  it('shows tags as chips and filters by a clicked label', () => {
    setTags(TAGS);
    renderTable();

    expect(screen.getByRole('columnheader', { name: /Tags/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Filter by region=eu-west' }));

    expect(bodyEntries()).toEqual(['aks-prod']);
    expect(JSON.parse(localStorage.getItem('table_filters.home-clusters')!)).toEqual([
      { id: 'tags', value: 'region=eu-west' },
    ]);
  });

  it('uses the saved Tags column filter', () => {
    setTags(TAGS);
    localStorage.setItem(
      'table_filters.home-clusters',
      JSON.stringify([{ id: 'tags', value: 'environment=production' }])
    );
    renderTable();

    expect(bodyEntries()).toEqual(['aks-prod', 'plugin-cluster']);
  });

  it('filters tags from context extensions without browser-local settings', () => {
    const clusters = CLUSTERS.map(cluster => ({
      ...cluster,
      meta_data: {
        ...cluster.meta_data,
        extensions: { headlamp_info: { tags: TAGS[cluster.name] ?? {} } },
      },
    }));
    renderTable(clusters);
    fireEvent.click(screen.getByRole('button', { name: 'Filter by region=eu-west' }));
    expect(bodyEntries()).toEqual(['aks-prod']);
    expect(localStorage.getItem('cluster_settings.aks-prod')).toBeNull();
  });

  it('restores the saved Tags column filter and clears it on a repeated chip click', () => {
    setTags(TAGS);
    localStorage.setItem(
      'table_filters.home-clusters',
      JSON.stringify([{ id: 'tags', value: 'region=eu-west' }])
    );
    renderTable();
    expect(bodyEntries()).toEqual(['aks-prod']);
    fireEvent.click(screen.getByRole('button', { name: 'Filter by region=eu-west' }));
    expect(bodyEntries()).toEqual(['aks-prod', 'in-cluster', 'plugin-cluster', 'spoke-a']);
    expect(JSON.parse(localStorage.getItem('table_filters.home-clusters')!)).toEqual([]);
  });

  it('replaces the label filter when another chip is clicked and clears it on a repeat click', () => {
    setTags(TAGS);
    renderTable();

    fireEvent.click(
      within(clusterRow('aks-prod')).getByRole('button', {
        name: 'Filter by environment=production',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Filter by region=eu-west' }));

    expect(bodyEntries()).toEqual(['aks-prod']);
    expect(JSON.parse(localStorage.getItem('table_filters.home-clusters')!)).toEqual([
      { id: 'tags', value: 'region=eu-west' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Filter by region=eu-west' }));

    expect(bodyEntries()).toEqual(['aks-prod', 'in-cluster', 'plugin-cluster', 'spoke-a']);
    expect(screen.queryByRole('button', { name: 'Clear label filter' })).not.toBeInTheDocument();
  });

  it.each(['environment=production', 'prod'])(
    'keeps the saved label filter %s accessible on narrow tables until it is cleared',
    async tagFilter => {
      vi.stubGlobal(
        'ResizeObserver',
        vi
          .fn()
          .mockImplementation(function (
            callback: (entries: { contentRect: { width: number } }[]) => void
          ) {
            return {
              observe: () => callback([{ contentRect: { width: 650 } }]),
              unobserve: vi.fn(),
              disconnect: vi.fn(),
            };
          })
      );
      setTags(TAGS);
      localStorage.setItem(
        'table_settings.home-clusters',
        JSON.stringify([{ id: 'tags', show: false }])
      );
      localStorage.setItem(
        'table_filters.home-clusters',
        JSON.stringify([
          { id: 'tags', value: tagFilter },
          { id: 'name', value: 'cluster' },
        ])
      );
      renderTable();

      const tagsHeader = screen.getByRole('columnheader', { name: /Tags/ });
      expect(bodyEntries()).toEqual(['plugin-cluster']);
      expect(screen.queryByRole('button', { name: 'Clear label filter' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Show/Hide filters' }));
      fireEvent.change(within(tagsHeader).getByRole('textbox'), { target: { value: '' } });

      await waitFor(() => expect(bodyEntries()).toEqual(['in-cluster', 'plugin-cluster']));
      await waitFor(() =>
        expect(JSON.parse(localStorage.getItem('table_filters.home-clusters')!)).toEqual([
          { id: 'name', value: 'cluster' },
        ])
      );
      expect(screen.queryByRole('columnheader', { name: /Tags/ })).not.toBeInTheDocument();
    }
  );

  it('matches chip filters exactly instead of matching value prefixes', () => {
    setTags({ ...TAGS, 'in-cluster': { environment: 'production-canary' } });
    renderTable();

    fireEvent.click(
      within(clusterRow('aks-prod')).getByRole('button', {
        name: 'Filter by environment=production',
      })
    );

    expect(bodyEntries()).toEqual(['aks-prod', 'plugin-cluster']);
  });

  it('reveals locally hidden Tags when a filter arrives from another tab', async () => {
    setTags(TAGS);
    renderTable();

    fireEvent.click(screen.getByRole('button', { name: 'Show/Hide columns' }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Tags' }));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('columnheader', { name: /Tags/ })).not.toBeInTheDocument();

    const filters = JSON.stringify([{ id: 'tags', value: 'environment=production' }]);
    act(() => {
      localStorage.setItem('table_filters.home-clusters', filters);
      window.dispatchEvent(
        Object.assign(new Event('storage'), {
          key: 'table_filters.home-clusters',
          newValue: filters,
          storageArea: localStorage,
        })
      );
    });

    const tagsHeader = await screen.findByRole('columnheader', { name: /Tags/ });
    expect(bodyEntries()).toEqual(['aks-prod', 'plugin-cluster']);
    fireEvent.click(screen.getByRole('button', { name: 'Show/Hide filters' }));
    fireEvent.change(within(tagsHeader).getByRole('textbox'), { target: { value: '' } });

    await waitFor(() =>
      expect(bodyEntries()).toEqual(['aks-prod', 'in-cluster', 'plugin-cluster', 'spoke-a'])
    );
    expect(screen.queryByRole('columnheader', { name: /Tags/ })).not.toBeInTheDocument();
  });

  it('matches an empty label value exactly', () => {
    setTags({ ...TAGS, 'in-cluster': { environment: '' } });
    renderTable();

    fireEvent.click(screen.getByRole('button', { name: 'Filter by environment=' }));

    expect(bodyEntries()).toEqual(['in-cluster']);
  });

  it('preserves fuzzy free-text filtering in the Tags column', () => {
    setTags(TAGS);
    localStorage.setItem(
      'table_filters.home-clusters',
      JSON.stringify([{ id: 'tags', value: 'prod' }])
    );
    renderTable();

    expect(bodyEntries()).toEqual(['aks-prod', 'plugin-cluster']);
  });

  it('groups clusters by a tag key, listing ungrouped clusters last', () => {
    setTags(TAGS);
    renderTable();

    expect(screen.queryByRole('combobox', { name: 'Group by tag' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Group by tag' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Group by tag' }));
    expect(screen.getByRole('menuitemradio', { name: 'None' })).toBeChecked();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'environment' }));

    expect(bodyEntries()).toEqual([
      '[environment=production(2)]',
      'aks-prod',
      'plugin-cluster',
      '[environment=staging(1)]',
      'in-cluster',
      '[Ungrouped(1)]',
      'spoke-a',
    ]);
    expect(screen.getByRole('button', { name: 'Group by tag' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Group by tag' }));
    expect(screen.getByRole('menuitemradio', { name: 'environment' })).toBeChecked();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'None' }));

    expect(bodyEntries()).toEqual(['aks-prod', 'in-cluster', 'plugin-cluster', 'spoke-a']);
    expect(screen.getByRole('button', { name: 'Group by tag' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(JSON.parse(localStorage.getItem('table_group_by.home-clusters')!)).toBe('');
  });

  it('remembers collapsed groups', () => {
    setTags(TAGS);
    localStorage.setItem('table_group_by.home-clusters', JSON.stringify('environment'));
    const { unmount } = renderTable();

    fireEvent.click(screen.getByRole('button', { name: 'environment=production (2)' }));

    expect(bodyEntries()).toEqual([
      '[environment=production(2)]',
      '[environment=staging(1)]',
      'in-cluster',
      '[Ungrouped(1)]',
      'spoke-a',
    ]);
    expect(JSON.parse(localStorage.getItem('table_collapsed_groups.home-clusters')!)).toEqual({
      environment: ['production'],
    });

    unmount();
    renderTable();

    expect(screen.getByRole('button', { name: 'environment=production (2)' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('only offers to view clusters once some are selected while grouped', () => {
    setTags(TAGS);
    localStorage.setItem('table_group_by.home-clusters', JSON.stringify('environment'));
    renderTable();

    // MRT opens its banner while grouping, which holds the "View Clusters" action.
    expect(screen.getByRole('button', { name: 'View Clusters', hidden: true })).not.toBeVisible();

    const prodRow = screen
      .getAllByRole('row')
      .find(row => row.closest('tbody') && row.textContent?.includes('aks-prod'))!;
    fireEvent.click(within(prodRow).getByRole('checkbox'));

    expect(screen.getByRole('button', { name: 'View Clusters' })).toBeVisible();
  });

  it('keeps the selection on the same clusters when filtering or grouping', () => {
    setTags(TAGS);
    renderTable();

    fireEvent.click(within(clusterRow('aks-prod')).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Filter by environment=staging' }));

    expect(bodyEntries()).toEqual(['in-cluster']);
    expect(within(clusterRow('in-cluster')).getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'View Clusters', hidden: true })).not.toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Filter by environment=staging' }));
    expect(bodyEntries()).toHaveLength(CLUSTERS.length);
    fireEvent.click(screen.getByRole('button', { name: 'Group by tag' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'environment' }));

    const checked = CLUSTERS.map(cluster => cluster.name).filter(
      name => (within(clusterRow(name)).getByRole('checkbox') as HTMLInputElement).checked
    );
    expect(checked).toEqual(['aks-prod']);
  });

  it('updates cluster status, warnings and version as they load', () => {
    setTags(TAGS);
    const connected = Object.fromEntries(CLUSTERS.map(cluster => [cluster.name, null]));
    // The same empty objects throughout, so each stage changes only what it says.
    const noVersions: ClusterTableProps['versions'] = {};
    const noWarnings: ClusterTableProps['warningLabels'] = {};
    // Only the table re-renders, as in the app, so the providers above it keep their values.
    let setLoaded: (
      loaded: Pick<ClusterTableProps, 'errors' | 'versions' | 'warningLabels'>
    ) => void = () => {};
    function Harness() {
      const [loaded, setLoadedState] = useState<
        Pick<ClusterTableProps, 'errors' | 'versions' | 'warningLabels'>
      >({ errors: {}, versions: noVersions, warningLabels: noWarnings });
      useEffect(() => {
        setLoaded = setLoadedState;
      }, [setLoadedState]);
      return (
        <ClusterTable
          customNameClusters={CLUSTERS}
          clusters={CLUSTERS_BY_NAME}
          connectedClusterNames={ALL_CONNECTED}
          onConnectCluster={() => {}}
          {...loaded}
        />
      );
    }
    render(
      <ThemeProvider theme={theme}>
        <TestContext>
          <Harness />
        </TestContext>
      </ThemeProvider>
    );
    expect(within(clusterRow('aks-prod')).getByText('Connecting…')).toBeInTheDocument();

    // The status arrives first, then the version and warnings, each on their own.
    act(() => setLoaded({ errors: connected, versions: noVersions, warningLabels: noWarnings }));

    expect(within(clusterRow('aks-prod')).queryByText('Connecting…')).not.toBeInTheDocument();
    expect(within(clusterRow('aks-prod')).getByText('Active')).toBeInTheDocument();

    act(() => setLoaded({ errors: connected, versions: VERSIONS, warningLabels: WARNING_LABELS }));

    expect(within(clusterRow('aks-prod')).getByText('v1.31.2')).toBeInTheDocument();
    expect(within(clusterRow('aks-prod')).getByText('2 warnings')).toBeInTheDocument();
  });

  it('applies a stored Tags column filter only while some cluster has tags', () => {
    localStorage.setItem(
      'table_filters.home-clusters',
      JSON.stringify([{ id: 'tags', value: 'environment' }])
    );
    setTags(TAGS);
    const { unmount } = renderTable();

    expect(bodyEntries()).toEqual(['aks-prod', 'in-cluster', 'plugin-cluster']);
    unmount();

    for (const cluster of Object.keys(TAGS)) {
      localStorage.removeItem(`cluster_settings.${cluster}`);
    }
    renderTable();

    expect(bodyEntries()).toEqual(['aks-prod', 'in-cluster', 'plugin-cluster', 'spoke-a']);
  });

  it('selects clusters whose names match object properties or group ids', () => {
    const clusters: Cluster[] = [
      { name: 'constructor', auth_type: '', meta_data: { source: 'kubeconfig' } },
      { name: 'tagGroup:production', auth_type: '', meta_data: { source: 'kubeconfig' } },
    ];
    setTags({
      constructor: { environment: 'production' },
      'tagGroup:production': { environment: 'production' },
    });
    localStorage.setItem('table_group_by.home-clusters', JSON.stringify('environment'));
    renderTable(clusters);

    const rows = screen.getAllByRole('row').filter(row => row.closest('tbody'));
    expect(rows.map(row => row.querySelector('button[aria-expanded]')?.textContent ?? '')).toEqual([
      'environment=production(2)',
      '',
      '',
    ]);
    const checkboxes = rows.slice(1).map(row => within(row).getByRole('checkbox'));
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
  });

  it('updates select all when a cluster on screen finishes connecting', () => {
    setTags(TAGS);
    localStorage.setItem('table_group_by.home-clusters', JSON.stringify('environment'));
    // Clusters still connecting have no entry yet; aks-prod has connected.
    const connecting: ClusterTableProps['errors'] = { 'aks-prod': null };
    // Only the table re-renders, as in the app, so the providers above it keep their values.
    let setErrors: (errors: ClusterTableProps['errors']) => void = () => {};
    function Harness() {
      const [errors, setErrorsState] = useState(connecting);
      useEffect(() => {
        setErrors = setErrorsState;
      }, [setErrorsState]);
      return (
        <ClusterTable
          customNameClusters={CLUSTERS}
          clusters={CLUSTERS_BY_NAME}
          versions={VERSIONS}
          errors={errors}
          warningLabels={WARNING_LABELS}
          connectedClusterNames={ALL_CONNECTED}
          onConnectCluster={() => {}}
        />
      );
    }
    render(
      <ThemeProvider theme={theme}>
        <TestContext>
          <Harness />
        </TestContext>
      </ThemeProvider>
    );
    const selectAll = () =>
      within(screen.getAllByRole('columnheader')[0]).getByRole('checkbox') as HTMLInputElement;

    fireEvent.click(within(clusterRow('aks-prod')).getByRole('checkbox'));
    expect(selectAll()).toBeChecked();

    act(() => setErrors({ ...connecting, 'plugin-cluster': null }));

    expect(within(clusterRow('plugin-cluster')).getByRole('checkbox')).toBeEnabled();
    expect(selectAll()).not.toBeChecked();
    expect(selectAll()).toHaveAttribute('data-indeterminate', 'true');
  });

  it('ignores stored filters and grouping once no cluster has tags', () => {
    localStorage.setItem(
      'table_label_filters.home-clusters',
      JSON.stringify(['environment=production'])
    );
    localStorage.setItem('table_group_by.home-clusters', JSON.stringify('environment'));
    renderTable();

    expect(bodyEntries()).toEqual(['aks-prod', 'in-cluster', 'plugin-cluster', 'spoke-a']);
  });

  it('updates the table after editing tags from the actions menu', async () => {
    setTags(TAGS);
    renderTable();

    const spokeRow = screen
      .getAllByRole('row')
      .find(row => row.closest('tbody') && row.textContent?.includes('spoke-a'))!;
    fireEvent.click(within(spokeRow).getByRole('button', { name: 'Actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit tags' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add tag' }));
    fireEvent.change(within(dialog).getByLabelText('Tag key'), {
      target: { value: 'environment' },
    });
    fireEvent.change(within(dialog).getByLabelText('Tag value'), {
      target: { value: 'staging' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      within(spokeRow).getByRole('button', { name: 'Filter by environment=staging' })
    ).toBeInTheDocument();
  });

  it('does not save tags that are not valid tag syntax', async () => {
    renderTable();

    const prodRow = screen
      .getAllByRole('row')
      .find(row => row.closest('tbody') && row.textContent?.includes('aks-prod'))!;
    fireEvent.click(within(prodRow).getByRole('button', { name: 'Actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit tags' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add tag' }));
    fireEvent.change(within(dialog).getByLabelText('Tag key'), {
      target: { value: 'not valid' },
    });

    expect(within(dialog).getByRole('alert')).toHaveTextContent('Invalid tags: not valid');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

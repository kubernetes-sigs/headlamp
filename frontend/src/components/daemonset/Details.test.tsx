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

import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import DaemonSetDetails from './Details';
import { DAEMONSET_DUMMY } from './storyHelper';

const theme = createMuiTheme({ name: 'light', base: 'light' });

const { mockDetailsGrid, mockOwnedPodsSection } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
  mockOwnedPodsSection: vi.fn(),
}));

vi.mock('../../lib/k8s/daemonSet', () => ({
  default: { kind: 'DaemonSet' },
}));

vi.mock('../common/Resource', async importOriginal => {
  const actual = await importOriginal<typeof import('../common/Resource')>();
  return {
    ...actual,
    DetailsGrid: (props: any) => {
      mockDetailsGrid(props);
      return null;
    },
    MetadataDictGrid: ({ dict }: any) => <div data-testid="dict-grid">{JSON.stringify(dict)}</div>,
    OwnedPodsSection: (props: any) => {
      mockOwnedPodsSection(props);
      return null;
    },
    RevisionHistorySection: () => null,
    RollbackButton: () => null,
    LogsButton: () => null,
  };
});

const fakeDaemonSet: any = {
  spec: {
    template: {
      spec: {
        tolerations: [
          {
            key: 'node.kubernetes.io/unreachable',
            operator: 'Exists',
            effect: 'NoExecute',
            tolerationSeconds: 300,
          },
          {
            key: 'node.kubernetes.io/not-ready',
            operator: 'Exists',
            effect: 'NoExecute',
          },
          {
            key: 'dedicated',
            operator: 'Equal',
            value: 'infra',
            effect: 'NoSchedule',
          },
        ],
      },
    },
  },
};

function renderExtraSections(sections: any[]) {
  return render(
    <ThemeProvider theme={theme}>
      <TestContext>
        {sections.map((s: any) => (
          <React.Fragment key={s.id}>{s.section}</React.Fragment>
        ))}
      </TestContext>
    </ThemeProvider>
  );
}

describe('DaemonSetDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
    mockOwnedPodsSection.mockReset();
  });

  it('passes the DaemonSet resource type and route params to DetailsGrid', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-ds' }}>
        <DaemonSetDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.resourceType.kind).toBe('DaemonSet');
    expect(props.name).toBe('my-ds');
    expect(props.namespace).toBe('default');
    expect(props.withEvents).toBe(true);
  });

  it('shows the tolerationSeconds value for NoExecute tolerations', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-daemonset' }}>
        <DaemonSetDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];

    const sections = props.extraSections(fakeDaemonSet);
    const tolerationsSection = sections.find((s: any) => s.id === 'headlamp.daemonset-tolerations');

    expect(tolerationsSection).toBeDefined();

    render(
      <ThemeProvider theme={theme}>
        <TestContext>{tolerationsSection.section}</TestContext>
      </ThemeProvider>
    );

    expect(screen.getByText('NoExecute (300s)')).toBeInTheDocument();
    expect(screen.getByText('NoExecute (forever)')).toBeInTheDocument();
    expect(screen.getByText('NoSchedule')).toBeInTheDocument();
  });

  it('builds extraInfo from a fully-populated DaemonSet', () => {
    render(
      <TestContext routerMap={{ namespace: 'gadget', name: 'gadget' }}>
        <DaemonSetDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const extraInfo = props.extraInfo(DAEMONSET_DUMMY);
    const byName = Object.fromEntries(extraInfo.map((f: any) => [f.name, f]));

    expect(byName['Update Strategy'].value).toBe('RollingUpdate');
    expect(byName['Selector'].value).toBeDefined();
    expect(byName['Node Selector'].value).toBeDefined();
  });

  it('handles daemonset with undefined or missing spec safely without throwing', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'empty-ds' }}>
        <DaemonSetDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const minimalDs = { metadata: { name: 'empty-ds' } };
    const extraInfo = props.extraInfo(minimalDs);
    const byName = Object.fromEntries(extraInfo.map((f: any) => [f.name, f]));

    expect(byName['Update Strategy'].value).toBeUndefined();
    expect(byName['Selector'].value).toBeDefined();
    expect(byName['Node Selector'].value).toBeDefined();
  });

  it('returns nothing from extraInfo and extraSections when there is no item', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-ds' }}>
        <DaemonSetDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.extraInfo(null)).toBeFalsy();
    expect(props.extraSections(null)).toBeFalsy();
  });

  it('suppresses OwnedPodsSection when selector is missing or empty and includes it when present', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-ds' }}>
        <DaemonSetDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];

    const missingSpecSections = props.extraSections({ metadata: { name: 'my-ds' } });
    expect(missingSpecSections.map((s: any) => s.id)).not.toContain(
      'headlamp.daemonset-owned-pods'
    );

    const emptySelectorSections = props.extraSections({
      metadata: { name: 'my-ds' },
      spec: { selector: {} },
    });
    expect(emptySelectorSections.map((s: any) => s.id)).not.toContain(
      'headlamp.daemonset-owned-pods'
    );

    const populatedSections = props.extraSections(DAEMONSET_DUMMY);
    expect(populatedSections.map((s: any) => s.id)).toContain('headlamp.daemonset-owned-pods');

    renderExtraSections(missingSpecSections);
    expect(mockOwnedPodsSection).not.toHaveBeenCalled();

    renderExtraSections(populatedSections);
    expect(mockOwnedPodsSection).toHaveBeenCalledTimes(1);
  });

  it('mounts extraSections with real ContainersSection safely for undefined, empty, and partial specs', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-ds' }}>
        <DaemonSetDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];

    const cases = [
      { metadata: { name: 'my-ds' } },
      { metadata: { name: 'my-ds' }, spec: {} },
      { metadata: { name: 'my-ds' }, spec: { template: { spec: {} } } },
    ];

    for (const ds of cases) {
      const sections = props.extraSections(ds);
      expect(sections).toHaveLength(3);

      const { unmount } = renderExtraSections(sections);
      expect(screen.getAllByText('No data to be shown.').length).toBeGreaterThanOrEqual(1);
      unmount();
    }
  });
});

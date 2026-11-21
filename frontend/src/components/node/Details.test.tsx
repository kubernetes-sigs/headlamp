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
import App from '../../App';
import Node from '../../lib/k8s/node';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import { lightTheme } from '../App/defaultAppThemes';
import NodeDetails from './Details';

const theme = createMuiTheme(lightTheme);

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
  MetadataDictGrid: () => <div data-testid="metadata-dict-grid" />,
  ConditionsSection: () => <div data-testid="conditions-section" />,
  OwnedPodsSection: () => <div data-testid="owned-pods-section" />,
}));

vi.mock('../../lib/k8s/node', async () => {
  const actual = await vi.importActual<typeof import('../../lib/k8s/node')>('../../lib/k8s/node');
  actual.default.useMetrics = vi.fn().mockReturnValue([[], null]) as any;
  actual.default.useNodeSummaryStats = vi.fn().mockReturnValue([null, null]) as any;
  actual.default.useGet = vi.fn().mockReturnValue([null, null]) as any;
  return actual;
});

vi.mock('../../lib/k8s/pod', () => ({
  default: {
    useList: vi.fn().mockReturnValue([[], null]),
  },
}));

function renderWithTheme(ui: React.ReactElement, routerMap?: Record<string, string>) {
  return render(
    <ThemeProvider theme={theme}>
      <TestContext routerMap={routerMap}>{ui}</TestContext>
    </ThemeProvider>
  );
}

describe('NodeDetails', () => {
  const makeNodeWithoutStatus = () =>
    new Node({
      apiVersion: 'v1',
      kind: 'Node',
      metadata: {
        name: 'node-without-status',
        creationTimestamp: '2022-01-01T00:00:00Z',
        uid: 'node-without-status-uid',
      },
      spec: {
        podCIDR: '10.244.0.0/24',
        taints: [],
      },
    });

  beforeEach(() => {
    mockDetailsGrid.mockReset();
  });

  it('passes Node resource and route params to DetailsGrid', () => {
    renderWithTheme(<NodeDetails name="test-node" />, { name: 'test-node' });

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.name).toBe('test-node');
    expect(props.resourceType).toBe(Node);
  });

  describe('when node status is undefined (regression test)', () => {
    it('safely builds extraInfo without throwing or crashing on missing status', () => {
      renderWithTheme(<NodeDetails name="node-without-status" />, { name: 'node-without-status' });

      const props = mockDetailsGrid.mock.calls[0][0];
      const node = makeNodeWithoutStatus();

      expect(() => props.extraInfo(node)).not.toThrow();
      const extraInfo = props.extraInfo(node);
      expect(Array.isArray(extraInfo)).toBe(true);

      const readyField = extraInfo.find((f: any) => String(f.name).includes('Ready'));
      expect(readyField).toBeDefined();

      const { container } = renderWithTheme(readyField.value);
      expect(container.textContent).toContain('No');
    });

    it('safely renders headerSection (ChartsSection) without throwing on missing status conditions', () => {
      renderWithTheme(<NodeDetails name="node-without-status" />, { name: 'node-without-status' });

      const props = mockDetailsGrid.mock.calls[0][0];
      const node = makeNodeWithoutStatus();

      expect(() => props.headerSection(node)).not.toThrow();

      renderWithTheme(props.headerSection(node));
      expect(screen.getByText('Not ready yet!')).toBeInTheDocument();
    });

    it('safely handles extraSections (AllocatedResources, SystemInfo) without crashing', () => {
      renderWithTheme(<NodeDetails name="node-without-status" />, { name: 'node-without-status' });

      const props = mockDetailsGrid.mock.calls[0][0];
      const node = makeNodeWithoutStatus();

      expect(() => props.extraSections(node)).not.toThrow();
      const sections = props.extraSections(node);
      expect(sections).toHaveLength(4);

      const allocationSection = sections.find(
        (s: any) => s.id === 'headlamp.node-resource-allocation'
      );
      expect(allocationSection).toBeDefined();
      expect(() => renderWithTheme(allocationSection.section)).not.toThrow();

      const systemInfoSection = sections.find((s: any) => s.id === 'headlamp.node-system-info');
      expect(systemInfoSection).toBeDefined();
      const { container: sysContainer } = renderWithTheme(systemInfoSection.section);
      expect(sysContainer).toBeEmptyDOMElement();
    });

    it('safely handles actions without throwing when node status is omitted', () => {
      renderWithTheme(<NodeDetails name="node-without-status" />, { name: 'node-without-status' });

      const props = mockDetailsGrid.mock.calls[0][0];
      const node = makeNodeWithoutStatus();

      expect(() => props.actions(node)).not.toThrow();
      const actions = props.actions(node);
      expect(actions.length).toBeGreaterThan(0);
    });
  });
});

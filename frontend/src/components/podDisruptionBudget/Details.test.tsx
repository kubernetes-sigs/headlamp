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
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import NameValueTable from '../common/NameValueTable/NameValueTable';
import PDBDetails from './Details';

const theme = createMuiTheme({ base: 'light', name: 'light' });

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../../lib/k8s/podDisruptionBudget', () => ({
  default: { kind: 'PodDisruptionBudget' },
}));

vi.mock('../common/Label', () => ({
  StatusLabel: ({ children }: any) => children,
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
}));

const pdb = {
  spec: { minAvailable: 2, maxUnavailable: 1 },
  selectors: ['app=nginx'],
  status: {
    disruptionsAllowed: 3,
    currentHealthy: 4,
    desiredHealthy: 4,
    expectedPods: 5,
  },
} as any;

describe('PDBDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
  });

  it('passes the route params and withEvents to DetailsGrid', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-pdb' }}>
        <PDBDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.name).toBe('my-pdb');
    expect(props.namespace).toBe('default');
    expect(props.withEvents).toBe(true);
  });

  it('includes the min/max, selector and status rows in extraInfo', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-pdb' }}>
        <PDBDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const names = props.extraInfo(pdb).map((f: any) => String(f.name).split('|').pop());

    expect(names).toContain('Max Unavailable');
    expect(names).toContain('Min Available');
    expect(names).toContain('Selector');
    expect(names).toContain('Status');
  });

  it('returns nothing from extraInfo when there is no item', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-pdb' }}>
        <PDBDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.extraInfo(null)).toBeFalsy();
  });

  describe('disruption limits row visibility (issue #8398)', () => {
    function getDisruptionRows(item: any) {
      render(
        <TestContext routerMap={{ namespace: 'default', name: 'my-pdb' }}>
          <PDBDetails />
        </TestContext>
      );
      const props = mockDetailsGrid.mock.calls[0][0];
      const rows = props.extraInfo(item);
      const maxUnavailableRow = rows.find((r: any) => String(r.name).includes('Max Unavailable'));
      const minAvailableRow = rows.find((r: any) => String(r.name).includes('Min Available'));
      return { rows, maxUnavailableRow, minAvailableRow };
    }

    it('shows Min Available and hides Max Unavailable when only minAvailable is specified', () => {
      const { maxUnavailableRow, minAvailableRow } = getDisruptionRows({
        spec: { minAvailable: 1 },
        selectors: [],
        status: {},
      });

      expect(minAvailableRow.hide).toBe(false);
      expect(maxUnavailableRow.hide).toBe(true);
    });

    it('shows Max Unavailable and hides Min Available when only maxUnavailable is specified', () => {
      const { maxUnavailableRow, minAvailableRow } = getDisruptionRows({
        spec: { maxUnavailable: 1 },
        selectors: [],
        status: {},
      });

      expect(maxUnavailableRow.hide).toBe(false);
      expect(minAvailableRow.hide).toBe(true);
    });

    it('preserves and shows Max Unavailable when value is 0', () => {
      const { maxUnavailableRow, minAvailableRow } = getDisruptionRows({
        spec: { maxUnavailable: 0 },
        selectors: [],
        status: {},
      });

      expect(maxUnavailableRow.hide).toBe(false);
      expect(minAvailableRow.hide).toBe(true);
    });

    it('preserves and shows Min Available when value is 0', () => {
      const { maxUnavailableRow, minAvailableRow } = getDisruptionRows({
        spec: { minAvailable: 0 },
        selectors: [],
        status: {},
      });

      expect(minAvailableRow.hide).toBe(false);
      expect(maxUnavailableRow.hide).toBe(true);
    });

    it('renders percentage strings such as "50%" correctly without hiding', () => {
      const { maxUnavailableRow, minAvailableRow } = getDisruptionRows({
        spec: { minAvailable: '50%' },
        selectors: [],
        status: {},
      });

      expect(minAvailableRow.hide).toBe(false);
      expect(maxUnavailableRow.hide).toBe(true);
    });

    it('renders only the configured disruption limit in NameValueTable', () => {
      const { rows } = getDisruptionRows({
        spec: { minAvailable: 1 },
        selectors: [],
        status: {},
      });

      const { getByText, queryByText } = render(
        <ThemeProvider theme={theme}>
          <NameValueTable rows={rows} />
        </ThemeProvider>
      );

      expect(getByText(/Min Available/)).toBeInTheDocument();
      expect(queryByText(/Max Unavailable/)).toBeNull();
    });
  });
});

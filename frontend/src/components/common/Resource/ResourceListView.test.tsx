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
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../../lib/k8s', () => ({
  useSelectedClusters: vi.fn(() => ['test-cluster']),
}));

// Capture props ResourceListView forwards to ResourceTable, so we can inspect
// the auto-injected emptyActions without dragging in the whole table stack.
const { lastResourceTablePropsHolder } = vi.hoisted(() => ({
  lastResourceTablePropsHolder: { current: null as any },
}));

vi.mock('./ResourceTable', () => ({
  __esModule: true,
  default: (props: any) => {
    lastResourceTablePropsHolder.current = props;
    return <div data-testid="mock-resource-table" />;
  },
}));

// Mark the EmptyStateActions rendering so we can detect the auto-default.
vi.mock('./EmptyStateActions', () => ({
  EmptyStateActions: ({ resourceClass }: any) => (
    <div data-testid="empty-state-actions" data-kind={resourceClass?.kind} />
  ),
}));

import ResourceListView from './ResourceListView';

const theme = createMuiTheme({ base: 'light', name: 'light' });

const podClass = {
  kind: 'Pod',
  apiName: 'pods',
  apiVersion: 'v1',
  isNamespaced: true,
} as any;

function renderView(props: any) {
  return render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <ResourceListView {...props} />
      </ThemeProvider>
    </TestContext>
  );
}

describe('ResourceListView emptyActions defaulting', () => {
  beforeEach(() => {
    lastResourceTablePropsHolder.current = null;
  });

  it('auto-injects EmptyStateActions when a resourceClass is provided and the caller did not set emptyActions', () => {
    renderView({ title: <span>Pods</span>, resourceClass: podClass, columns: [] });
    expect(lastResourceTablePropsHolder.current).not.toBeNull();
    const injected = lastResourceTablePropsHolder.current.emptyActions;
    expect(injected).toBeDefined();
    const { getByTestId } = render(<>{injected}</>);
    expect(getByTestId('empty-state-actions').getAttribute('data-kind')).toBe('Pod');
  });

  it('respects an explicit emptyActions override from the caller', () => {
    const custom = <span data-testid="custom-actions" />;
    renderView({
      title: <span>Pods</span>,
      resourceClass: podClass,
      columns: [],
      emptyActions: custom,
    });
    expect(lastResourceTablePropsHolder.current.emptyActions).toBe(custom);
  });

  it('respects emptyActions={null} to opt out of the default', () => {
    renderView({
      title: <span>Pods</span>,
      resourceClass: podClass,
      columns: [],
      emptyActions: null,
    });
    expect(lastResourceTablePropsHolder.current.emptyActions).toBeNull();
  });

  it('does not inject a default when no resourceClass is provided (nested list on a Details page)', () => {
    renderView({ title: <span>Sub-list</span>, data: [], columns: [] });
    expect(lastResourceTablePropsHolder.current.emptyActions).toBeUndefined();
  });
});

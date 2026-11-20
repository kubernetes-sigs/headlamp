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

import { render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import DaemonSetDetails from './Details';
import { DAEMONSET_DUMMY } from './storyHelper';

const { mockDetailsGrid, mockSimpleTable } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
  mockSimpleTable: vi.fn(),
}));

vi.mock('../../lib/k8s/daemonSet', () => ({
  default: { kind: 'DaemonSet' },
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
  MetadataDictGrid: ({ dict }: any) => <div data-testid="dict-grid">{JSON.stringify(dict)}</div>,
  ContainersSection: () => null,
  OwnedPodsSection: () => null,
  RevisionHistorySection: () => null,
  RollbackButton: () => null,
  LogsButton: () => null,
}));

vi.mock('../common/SectionBox', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('../common/SimpleTable', () => ({
  default: (props: any) => {
    mockSimpleTable(props);
    return null;
  },
}));

describe('DaemonSetDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
    mockSimpleTable.mockReset();
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

  it('mounts extraSections safely when spec is undefined', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-ds' }}>
        <DaemonSetDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const minimalDs = { metadata: { name: 'my-ds' } };
    const sections = props.extraSections(minimalDs);
    expect(sections).toHaveLength(4);

    expect(() =>
      render(
        <TestContext>
          {sections.map((s: any) => (
            <React.Fragment key={s.id}>{s.section}</React.Fragment>
          ))}
        </TestContext>
      )
    ).not.toThrow();

    expect(mockSimpleTable).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [],
      })
    );
  });

  it('mounts extraSections safely when spec is present but template is missing', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-ds' }}>
        <DaemonSetDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const dsWithEmptySpec = { metadata: { name: 'my-ds' }, spec: {} };
    const sections = props.extraSections(dsWithEmptySpec);
    expect(sections).toHaveLength(4);

    mockSimpleTable.mockClear();
    expect(() =>
      render(
        <TestContext>
          {sections.map((s: any) => (
            <React.Fragment key={s.id}>{s.section}</React.Fragment>
          ))}
        </TestContext>
      )
    ).not.toThrow();

    expect(mockSimpleTable).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [],
      })
    );
  });
});

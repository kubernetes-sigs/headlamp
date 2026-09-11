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
import { TestContext } from '../../../test';
import ResourceListView from './ResourceListView';

const { lastResourceTablePropsHolder, lastSectionFilterHeaderPropsHolder } = vi.hoisted(() => ({
  lastResourceTablePropsHolder: { current: null as any },
  lastSectionFilterHeaderPropsHolder: { current: null as any },
}));

vi.mock('./ResourceTable', () => ({
  default: (props: any) => {
    lastResourceTablePropsHolder.current = props;
    return <div data-testid="mock-resource-table" />;
  },
}));

// URL sync and widget rendering are out of scope here; only the noNamespaceFilter
// value forwarded to SectionFilterHeader (to compare against ResourceTable) is under test.
vi.mock('../SectionFilterHeader', () => ({
  default: (props: any) => {
    lastSectionFilterHeaderPropsHolder.current = props;
    return null;
  },
}));

// Avoids pulling in the full resource-class import graph (unrelated to this test).
vi.mock('../CreateResourceButton', () => ({
  CreateResourceButton: () => null,
}));

// Lightweight fakes standing in for a real KubeObjectClass, so these tests don't
// need to pull in an actual resource-class import graph.
class FakeNamespacedResource {
  static isNamespaced = true;
}

class FakeClusterScopedResource {
  static isNamespaced = false;
}

describe('ResourceListView effective noNamespaceFilter', () => {
  beforeEach(() => {
    lastResourceTablePropsHolder.current = null;
    lastSectionFilterHeaderPropsHolder.current = null;
  });

  describe('without a resourceClass', () => {
    it.each([
      {
        description: 'headerProps is not provided',
        headerProps: undefined,
        expected: true,
      },
      {
        description: 'headerProps is {} (no noNamespaceFilter key)',
        headerProps: {},
        expected: true,
      },
      {
        description:
          'headerProps has a noNamespaceFilter key present but undefined (e.g. Pod/Job renderers)',
        headerProps: { noNamespaceFilter: undefined },
        expected: false,
      },
      {
        description: 'headerProps.noNamespaceFilter is explicitly false',
        headerProps: { noNamespaceFilter: false },
        expected: false,
      },
      {
        description: 'headerProps.noNamespaceFilter is explicitly true',
        headerProps: { noNamespaceFilter: true },
        expected: true,
      },
    ])(
      'resolves noNamespaceFilter=$expected for both SectionFilterHeader and ResourceTable when $description',
      ({ headerProps, expected }) => {
        render(
          <TestContext>
            <ResourceListView title="Pods" columns={[]} data={[]} headerProps={headerProps} />
          </TestContext>
        );

        expect(lastResourceTablePropsHolder.current.noNamespaceFilter).toBe(expected);
        expect(lastSectionFilterHeaderPropsHolder.current.noNamespaceFilter).toBe(expected);
      }
    );
  });

  describe('with a resourceClass and no header override', () => {
    it.each([
      {
        description: 'a namespaced resourceClass',
        resourceClass: FakeNamespacedResource,
        expected: false,
      },
      {
        description: 'a cluster-scoped resourceClass',
        resourceClass: FakeClusterScopedResource,
        expected: true,
      },
    ])(
      'resolves noNamespaceFilter=$expected for both SectionFilterHeader and ResourceTable given $description',
      ({ resourceClass, expected }) => {
        render(
          <TestContext>
            <ResourceListView title="Pods" columns={[]} resourceClass={resourceClass as any} />
          </TestContext>
        );

        expect(lastResourceTablePropsHolder.current.noNamespaceFilter).toBe(expected);
        expect(lastSectionFilterHeaderPropsHolder.current.noNamespaceFilter).toBe(expected);
      }
    );
  });

  // Regression guard for renderers like pod/List.tsx and the Jobs list, which never set
  // resourceClass and always pass a headerProps object where the noNamespaceFilter key
  // is present but undefined (e.g. `{ noNamespaceFilter, titleSideActions, actions }`
  // with an undefined local `noNamespaceFilter`). This preserves their existing rendered
  // behavior (namespace selector shown, global filter applied) unchanged.
  it('keeps applying the namespace filter for a headerProps object with an undefined noNamespaceFilter key and other props', () => {
    render(
      <TestContext>
        <ResourceListView
          title="Pods"
          columns={[]}
          data={[]}
          headerProps={{ noNamespaceFilter: undefined, titleSideActions: [] }}
        />
      </TestContext>
    );

    expect(lastResourceTablePropsHolder.current.noNamespaceFilter).toBe(false);
    expect(lastSectionFilterHeaderPropsHolder.current.noNamespaceFilter).toBe(false);
  });
});

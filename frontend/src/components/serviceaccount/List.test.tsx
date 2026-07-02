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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import ServiceAccountList from './List';
import { BASE_SERVICE_ACCOUNT } from './storyHelper';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s/serviceAccount', () => ({
  default: { kind: 'ServiceAccount' },
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

describe('ServiceAccountList', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('renders with the ServiceAccount resource class and the expected columns', () => {
    render(
      <TestContext>
        <ServiceAccountList />
      </TestContext>
    );

    expect(mockListView).toHaveBeenCalled();
    const props = mockListView.mock.calls[0][0];
    expect(props.resourceClass).toEqual(expect.objectContaining({ kind: 'ServiceAccount' }));
    const columnIds = props.columns.map((c: any) => (typeof c === 'string' ? c : c.id));
    expect(columnIds).toEqual(['name', 'namespace', 'cluster', 'secrets', 'labels', 'age']);
  });

  it('reads the secrets column value from the ServiceAccount secrets field', () => {
    render(
      <TestContext>
        <ServiceAccountList />
      </TestContext>
    );

    const props = mockListView.mock.calls[0][0];
    const secretsCol = props.columns.find((c: any) => c?.id === 'secrets');
    expect(secretsCol.getValue(BASE_SERVICE_ACCOUNT)).toBe(1);
  });
});

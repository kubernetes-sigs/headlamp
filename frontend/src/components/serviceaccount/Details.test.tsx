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
import ServiceAccountDetails from './Details';
import { BASE_SERVICE_ACCOUNT } from './storyHelper';

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../../lib/k8s', () => ({
  ResourceClasses: {
    Role: { kind: 'Role', isNamespaced: true, detailsRoute: 'role' },
    ClusterRole: { kind: 'ClusterRole', isNamespaced: false, detailsRoute: 'clusterrole' },
  },
}));

vi.mock('../../lib/k8s/serviceAccount', () => ({
  default: { kind: 'ServiceAccount' },
}));

vi.mock('../../lib/k8s/roleBinding', () => ({
  default: {
    useList: vi.fn(() => ({ items: [], isLoading: false, isError: null })),
  },
}));

vi.mock('../../lib/k8s/clusterRoleBinding', () => ({
  default: {
    useList: vi.fn(() => ({ items: [], isLoading: false, isError: null })),
  },
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
}));

describe('ServiceAccountDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
  });

  it('passes the ServiceAccount resource type and route params to DetailsGrid', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-sa' }}>
        <ServiceAccountDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.resourceType).toEqual(expect.objectContaining({ kind: 'ServiceAccount' }));
    expect(props.name).toBe('my-sa');
    expect(props.namespace).toBe('default');
    expect(props.withEvents).toBe(true);
  });

  it('builds extraInfo from the ServiceAccount fields with secrets and token enabled', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-sa' }}>
        <ServiceAccountDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];
    const extraInfo = props.extraInfo(BASE_SERVICE_ACCOUNT);

    const secretsField = extraInfo.find((f: any) => f.name === 'Secrets');
    expect(secretsField).toBeDefined();
    expect(secretsField.hide).toBe(false);
    expect(secretsField.value.props.items).toEqual(BASE_SERVICE_ACCOUNT.secrets);
    expect(secretsField.value.props.namespace).toBe('default');

    const imagePullSecretsField = extraInfo.find((f: any) => f.name === 'Image Pull Secrets');
    expect(imagePullSecretsField).toBeDefined();
    expect(imagePullSecretsField.hide).toBe(false);
    expect(imagePullSecretsField.value.props.items).toEqual(BASE_SERVICE_ACCOUNT.imagePullSecrets);
    expect(imagePullSecretsField.value.props.namespace).toBe('default');

    const automountField = extraInfo.find((f: any) => f.name === 'Automount Service Account Token');
    expect(automountField).toBeDefined();
    expect(automountField.hide).toBe(false);
    expect(automountField.value).toBe('Yes');
  });

  it('hides secrets and pull secrets when empty, and handles disabled automount token', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-sa' }}>
        <ServiceAccountDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];

    const saWithNoSecrets = {
      ...BASE_SERVICE_ACCOUNT,
      secrets: [],
      imagePullSecrets: [],
      automountServiceAccountToken: false,
    };
    const extraInfo = props.extraInfo(saWithNoSecrets);

    const secretsField = extraInfo.find((f: any) => f.name === 'Secrets');
    expect(secretsField).toBeDefined();
    expect(secretsField.hide).toBe(true);

    const imagePullSecretsField = extraInfo.find((f: any) => f.name === 'Image Pull Secrets');
    expect(imagePullSecretsField).toBeDefined();
    expect(imagePullSecretsField.hide).toBe(true);

    const automountField = extraInfo.find((f: any) => f.name === 'Automount Service Account Token');
    expect(automountField).toBeDefined();
    expect(automountField.hide).toBe(false);
    expect(automountField.value).toBe('No');
  });

  it('hides automount token field when undefined', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-sa' }}>
        <ServiceAccountDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];

    const saWithUndefinedToken = {
      ...BASE_SERVICE_ACCOUNT,
      automountServiceAccountToken: undefined,
    };
    const extraInfo = props.extraInfo(saWithUndefinedToken);

    const automountField = extraInfo.find((f: any) => f.name === 'Automount Service Account Token');
    expect(automountField).toBeDefined();
    expect(automountField.hide).toBe(true);
  });

  it('returns nothing from extraInfo when there is no item', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-sa' }}>
        <ServiceAccountDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.extraInfo(null)).toBeFalsy();
  });
});

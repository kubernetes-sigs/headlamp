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
import Deployment from '../../lib/k8s/deployment';
import DeploymentsList from './List';

const { mockResourceListView } = vi.hoisted(() => ({
  mockResourceListView: vi.fn(),
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockResourceListView(props);
    return null;
  },
}));

vi.mock('react-i18next', async importOriginal => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

describe('DeploymentsList column definitions and renderers', () => {
  beforeEach(() => {
    mockResourceListView.mockReset();
  });

  it('handles deployment with undefined status and spec without throwing', () => {
    render(<DeploymentsList />);

    const props = mockResourceListView.mock.calls[0][0];
    const bareDeployment = new Deployment({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'test-deployment', namespace: 'default' },
    } as any);

    for (const col of props.columns) {
      if (typeof col === 'object' && typeof col.getValue === 'function') {
        expect(() => col.getValue(bareDeployment)).not.toThrow();
      }
      if (typeof col === 'object' && typeof col.render === 'function') {
        expect(() => col.render(bareDeployment)).not.toThrow();
      }
    }

    const podsCol = props.columns.find((c: any) => c.id === 'pods');
    expect(podsCol.getValue(bareDeployment)).toBe(0);
    expect(podsCol.render(bareDeployment)).toBe('0/0');

    const replicasCol = props.columns.find((c: any) => c.id === 'replicas');
    expect(replicasCol.getValue(bareDeployment)).toBe(0);

    const conditionsCol = props.columns.find((c: any) => c.id === 'conditions');
    expect(conditionsCol.getValue(bareDeployment)).toBe('');
    expect(conditionsCol.render(bareDeployment)).toBeNull();

    const containersCol = props.columns.find((c: any) => c.id === 'containers');
    expect(containersCol.getValue(bareDeployment)).toBe('');

    const imagesCol = props.columns.find((c: any) => c.id === 'images');
    expect(imagesCol.getValue(bareDeployment)).toBe('');
  });

  it.each([
    ['True', 'error'],
    ['False', 'success'],
    ['Unknown', 'error'],
  ])('colors ReplicaFailure=%s as %s', (status, expected) => {
    render(<DeploymentsList />);

    const props = mockResourceListView.mock.calls[0][0];
    const conditionsCol = props.columns.find((c: any) => c.id === 'conditions');
    const deployment = new Deployment({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'test-deployment', namespace: 'default' },
      status: {
        conditions: [
          { type: 'Available', status: 'True' },
          { type: 'ReplicaFailure', status },
        ],
      },
    } as any);

    const labels = conditionsCol.render(deployment);
    const colors = Object.fromEntries(
      labels.map((label: any) => [label.key, label.props.children.props.status])
    );
    expect(colors).toEqual({ Available: 'success', ReplicaFailure: expected });
  });

  it('displays and sorts Pods using readyReplicas over spec.replicas', () => {
    render(<DeploymentsList />);

    const props = mockResourceListView.mock.calls[0][0];
    const podsCol = props.columns.find((c: any) => c.id === 'pods');

    // Mid-rollout surge: status.replicas is 4 while spec.replicas is 3.
    const surging = new Deployment({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'surging', namespace: 'default' },
      spec: { replicas: 3 },
      status: { replicas: 4, readyReplicas: 3, availableReplicas: 3 },
    } as any);
    expect(podsCol.render(surging)).toBe('3/3');
    expect(podsCol.getValue(surging)).toBe(3);

    // minReadySeconds delay: pods are ready before they are available.
    const warmingUp = new Deployment({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'warming-up', namespace: 'default' },
      spec: { replicas: 3 },
      status: { replicas: 3, readyReplicas: 3, availableReplicas: 0 },
    } as any);
    expect(podsCol.render(warmingUp)).toBe('3/3');
    expect(podsCol.getValue(warmingUp)).toBe(3);

    // ResourceQuota blocked pod creation: status.replicas < spec.replicas.
    const quotaLimited = new Deployment({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'quota-limited', namespace: 'default' },
      spec: { replicas: 3 },
      status: { replicas: 1, readyReplicas: 1, availableReplicas: 1 },
    } as any);
    expect(podsCol.render(quotaLimited)).toBe('1/3');
    expect(podsCol.getValue(quotaLimited)).toBe(1);
  });
});

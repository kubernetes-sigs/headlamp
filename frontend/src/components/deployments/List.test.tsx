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
});

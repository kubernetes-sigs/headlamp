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
import StatefulSet from '../../lib/k8s/statefulSet';
import { TestContext } from '../../test';
import StatefulSetDetails from './Details';

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
  ContainersSection: () => null,
  LogsButton: () => null,
  MetadataDictGrid: () => null,
  OwnedPodsSection: () => null,
  RevisionHistorySection: () => null,
  RollbackButton: () => null,
}));

vi.mock('react-i18next', async importOriginal => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

describe('StatefulSetDetails extraInfo and sections', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
  });

  it('handles statefulset with undefined status and spec without throwing in extraInfo', () => {
    render(
      <TestContext>
        <StatefulSetDetails name="test-ss" namespace="default" />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const bareStatefulSet = new StatefulSet({
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: { name: 'test-ss', namespace: 'default' },
    } as any);

    expect(() => props.extraInfo(bareStatefulSet)).not.toThrow();
    const extraInfo = props.extraInfo(bareStatefulSet);
    expect(extraInfo).toBeDefined();

    const updateStrategy = extraInfo.find((item: any) => item.name === 'Update Strategy');
    expect(updateStrategy.hide).toBe(true);

    const selector = extraInfo.find((item: any) => item.name === 'Selector');
    expect(selector.hide).toBe(true);
  });

  it('displays update strategy and selector when spec is populated', () => {
    render(
      <TestContext>
        <StatefulSetDetails name="test-ss" namespace="default" />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const populatedStatefulSet = new StatefulSet({
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: { name: 'test-ss', namespace: 'default' },
      spec: {
        updateStrategy: { type: 'RollingUpdate' },
        selector: { matchLabels: { app: 'web' } },
      },
    } as any);

    expect(() => props.extraInfo(populatedStatefulSet)).not.toThrow();
    const extraInfo = props.extraInfo(populatedStatefulSet);

    const updateStrategy = extraInfo.find((item: any) => item.name === 'Update Strategy');
    expect(updateStrategy.value).toBe('RollingUpdate');
    expect(updateStrategy.hide).toBeFalsy();

    const selector = extraInfo.find((item: any) => item.name === 'Selector');
    expect(selector.value).toBeDefined();
    expect(selector.hide).toBeFalsy();
  });
});

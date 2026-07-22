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
import SecretDetails from './Details';
import { BASE_SECRET } from './storyHelper';

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../../lib/k8s/secret', () => ({
  default: { kind: 'Secret' },
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
  SecretField: () => null,
}));

describe('SecretDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
  });

  it('passes the Secret resource type and route params to DetailsGrid', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-pvc' }}>
        <SecretDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.resourceType.kind).toBe('Secret');
    expect(props.name).toBe('my-pvc');
    expect(props.namespace).toBe('default');
    expect(props.withEvents).toBe(true);
  });

  it('builds extraInfo from the secret spec', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-pvc' }}>
        <SecretDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const extraInfo = props.extraInfo(BASE_SECRET);

    expect(extraInfo).toHaveLength(1);
    expect(extraInfo[0].name).toContain('Type');
    expect(extraInfo[0].value).toBe('test');
  });

  it('returns nothing from extraInfo when there is no item', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-pvc' }}>
        <SecretDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.extraInfo(null)).toBeFalsy();
  });

  it('provides extraSections that renders SecretDataSection', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-pvc' }}>
        <SecretDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const extraSections = props.extraSections(BASE_SECRET);
    expect(extraSections).toHaveLength(1);
    expect(extraSections[0].id).toBe('headlamp.secrets-data');
    expect(extraSections[0].section).toBeDefined();
  });
});

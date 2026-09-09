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
import { RuntimeClassDetails } from './Details';
import { RUNTIME_CLASS_DUMMY_DATA } from './storyHelper';

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../../lib/k8s/runtime', () => ({
  RuntimeClass: { kind: 'RuntimeClass' },
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
}));

const runtimeClass = { jsonData: RUNTIME_CLASS_DUMMY_DATA[0] } as any;

describe('RuntimeClassDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
  });

  it('passes the route name and withEvents to DetailsGrid', () => {
    render(
      <TestContext routerMap={{ name: 'runtime-class' }}>
        <RuntimeClassDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.name).toBe('runtime-class');
    expect(props.withEvents).toBe(true);
  });

  it('exposes the handler in extraInfo', () => {
    render(
      <TestContext routerMap={{ name: 'runtime-class' }}>
        <RuntimeClassDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const extraInfo = props.extraInfo(runtimeClass);
    expect(extraInfo).toHaveLength(1);
    expect(extraInfo[0].name).toContain('Handler');
    expect(extraInfo[0].value).toBe('handler');
  });

  it('returns nothing from extraInfo when there is no item', () => {
    render(
      <TestContext routerMap={{ name: 'runtime-class' }}>
        <RuntimeClassDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.extraInfo(null)).toBeFalsy();
  });
});

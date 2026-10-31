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
import ResourceListView from './ResourceListView';

const { createButtonProps } = vi.hoisted(() => ({ createButtonProps: vi.fn() }));

vi.mock('../CreateResourceButton', () => ({
  CreateResourceButton: (props: any) => {
    createButtonProps(props);
    return null;
  },
}));

vi.mock('../SectionBox', () => ({
  default: (props: any) => (
    <>
      {props.title}
      {props.children}
    </>
  ),
}));

vi.mock('../SectionFilterHeader', () => ({
  default: (props: any) => <>{props.titleSideActions}</>,
}));

vi.mock('./ResourceTable', () => ({ default: () => null }));

const resourceClass = { kind: 'DeviceClass', isNamespaced: false } as any;

function renderList(clusters?: string[]) {
  render(
    <ResourceListView
      title="Device Classes"
      resourceClass={resourceClass}
      clusters={clusters}
      columns={[]}
    />
  );
}

describe('ResourceListView', () => {
  beforeEach(() => createButtonProps.mockReset());

  it('leaves the create action on its default cluster when the list is not limited', () => {
    renderList();

    expect(createButtonProps).toHaveBeenCalled();
    expect(createButtonProps.mock.lastCall?.[0].cluster).toBeUndefined();
  });

  it('creates in the first of the clusters the list is limited to', () => {
    renderList(['dra', 'other-dra']);

    expect(createButtonProps.mock.lastCall?.[0].cluster).toBe('dra');
  });

  it('offers no create action when the list is limited to no cluster', () => {
    renderList([]);

    expect(createButtonProps).not.toHaveBeenCalled();
  });
});

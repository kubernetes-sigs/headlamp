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

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Activity } from '../activity/Activity';
import { CreateResourceButton } from './CreateResourceButton';

const { authVisibleProps, editorDialogProps } = vi.hoisted(() => ({
  authVisibleProps: vi.fn(),
  editorDialogProps: vi.fn(),
}));

vi.mock('../../lib/k8s', () => ({
  useSelectedClusters: () => ['legacy', 'dra'],
}));

vi.mock('../activity/Activity', () => ({
  Activity: { launch: vi.fn(), close: vi.fn() },
}));

vi.mock('../common/Resource', () => ({
  AuthVisible: (props: any) => {
    authVisibleProps(props);
    return props.children;
  },
  EditorDialog: (props: any) => {
    editorDialogProps(props);
    return null;
  },
}));

vi.mock('./Resource/CreateButton', () => ({
  parseEditorObject: vi.fn(),
  RESOURCE_DEFINITIONS: {},
}));

const resourceClass = {
  kind: 'DeviceClass',
  apiName: 'deviceclasses',
  getBaseObject: () => ({ kind: 'DeviceClass' }),
} as any;

function launchCreate(cluster?: string) {
  render(<CreateResourceButton resourceClass={resourceClass} cluster={cluster} />);
  fireEvent.click(screen.getByRole('button'));
  const activity = vi.mocked(Activity.launch).mock.calls[0][0];
  render(<>{activity.content}</>);
  return activity;
}

describe('CreateResourceButton', () => {
  beforeEach(() => {
    vi.mocked(Activity.launch).mockReset();
    authVisibleProps.mockReset();
    editorDialogProps.mockReset();
  });

  it('creates in the first selected cluster by default', () => {
    const activity = launchCreate();

    expect(activity.cluster).toBe('legacy');
    expect(authVisibleProps.mock.calls[0][0].cluster).toBeUndefined();
    expect(editorDialogProps.mock.calls[0][0].cluster).toBeUndefined();
  });

  it('checks and creates in the given cluster', () => {
    const activity = launchCreate('dra');

    expect(activity.cluster).toBe('dra');
    expect(authVisibleProps.mock.calls[0][0].cluster).toBe('dra');
    expect(editorDialogProps.mock.calls[0][0].cluster).toBe('dra');
  });
});

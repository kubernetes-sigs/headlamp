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
import { JobsListRenderer } from './List';

const { MockJobSuspendButton, mockResourceListView } = vi.hoisted(() => ({
  MockJobSuspendButton: vi.fn(() => null),
  mockResourceListView: vi.fn(),
}));

vi.mock('../../lib/k8s/job', () => ({
  default: { kind: 'Job' },
}));

vi.mock('./JobSuspendButton', () => ({
  default: MockJobSuspendButton,
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockResourceListView(props);
    return null;
  },
}));

const fakeJob: any = {
  kind: 'Job',
  metadata: { name: 'test-job', namespace: 'default', uid: 'job-abc-123' },
  spec: {
    completions: 1,
    parallelism: 1,
    template: {
      spec: {
        containers: [{ name: 'main', image: 'busybox' }],
      },
    },
  },
  status: {},
  getContainers: () => [{ name: 'main', image: 'busybox' }],
  getDuration: () => -1,
};

describe('JobsListRenderer', () => {
  beforeEach(() => {
    mockResourceListView.mockReset();
  });

  it('adds a suspend row action to the jobs table', () => {
    render(<JobsListRenderer jobs={[fakeJob]} />);

    const props = mockResourceListView.mock.calls[0][0];
    const suspendAction = props.actions.find((action: any) => action.id === 'suspend');
    const closeMenu = vi.fn();
    const button = suspendAction.action({ item: fakeJob, closeMenu });

    expect(button.type).toBe(MockJobSuspendButton);
    expect(button.props.item).toBe(fakeJob);
    expect(button.props.buttonStyle).toBe('menu');
    expect(button.props.afterConfirm).toBe(closeMenu);
  });
});

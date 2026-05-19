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

import 'vitest-canvas-mock';
import { fireEvent, render, screen } from '@testing-library/react';
import App from '../../../App';
import Deployment from '../../../lib/k8s/deployment';
import Service from '../../../lib/k8s/service';
import { TestContext } from '../../../test';
import { Activity } from '../../activity/Activity';
import { LogsButton } from './LogsButton';

// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

vi.mock('../LogsViewer/LogsViewer', () => ({
  LogsViewer: vi.fn(),
}));

vi.mock('../../activity/Activity', () => ({
  Activity: {
    launch: vi.fn(),
  },
}));

const deploymentData = {
  kind: 'Deployment',
  metadata: {
    name: 'test-deployment',
    namespace: 'default',
    creationTimestamp: '2024-01-01T00:00:00Z',
    uid: 'dep-123',
  },
  spec: {
    selector: { matchLabels: { app: 'test-app' } },
    strategy: {
      type: 'RollingUpdate',
    },
    template: {
      spec: {
        nodeName: 'test-node',
        containers: [{ name: 'nginx', image: 'nginx:latest', imagePullPolicy: 'Always' }],
      },
    },
  },
  status: {},
};

describe('LogsButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the logs button for a loggable workload', () => {
    render(
      <TestContext>
        <LogsButton item={new Deployment(deploymentData)} />
      </TestContext>
    );

    expect(screen.getByLabelText('Show logs')).toBeInTheDocument();
  });

  it('does not render the button for null item', () => {
    render(
      <TestContext>
        <LogsButton item={null} />
      </TestContext>
    );

    expect(screen.queryByLabelText('Show logs')).not.toBeInTheDocument();
  });

  it('does not render the button for a non-loggable resource', () => {
    render(
      <TestContext>
        <LogsButton item={new Service(Service.getBaseObject())} />
      </TestContext>
    );

    expect(screen.queryByLabelText('Show logs')).not.toBeInTheDocument();
  });

  it('launches Activity with correct metadata on click', () => {
    render(
      <TestContext>
        <LogsButton item={new Deployment(deploymentData)} />
      </TestContext>
    );

    fireEvent.click(screen.getByLabelText('Show logs'));

    expect(Activity.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'logs-dep-123',
        title: 'Logs: test-deployment',
      })
    );
  });
});

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

import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { TestContext } from '../../../test';
import PortForward from './PortForward';

export default {
  title: 'Resource/PortForward',
  component: PortForward,
  parameters: {
    docs: {
      description: {
        component:
          'A component for managing port forwarding for Kubernetes resources. Only renders in Electron (desktop) environment.',
      },
    },
  },
} as Meta;

const Template: StoryFn = args => (
  <TestContext>
    <PortForward {...args} />
  </TestContext>
);

// Port forward form
export const PortForwardForm = Template.bind({});
PortForwardForm.storyName = 'Port forward form';
PortForwardForm.args = {
  containerPort: 8080,
  resource: {
    kind: 'Pod',
    cluster: 'cluster1',
    metadata: {
      name: 'my-pod',
      namespace: 'default',
    },
    status: {
      phase: 'Running',
    },
  },
};
PortForwardForm.parameters = {
  docs: {
    description: {
      story:
        'Shows the port forward button. Note: PortForward only renders in Electron (desktop) environment — in browser it returns null.',
    },
  },
};

// Connection pending loading state
export const ConnectionPending = Template.bind({});
ConnectionPending.storyName = 'Connection pending loading state';
ConnectionPending.args = {
  containerPort: 3000,
  resource: {
    kind: 'Pod',
    cluster: 'cluster1',
    metadata: {
      name: 'my-pod',
      namespace: 'default',
    },
    status: {
      phase: 'Running',
    },
  },
};
ConnectionPending.parameters = {
  docs: {
    description: {
      story: 'Loading state shown while port forward connection is being established.',
    },
  },
};

// Connection established success
export const ConnectionEstablished = Template.bind({});
ConnectionEstablished.storyName = 'Connection established success';
ConnectionEstablished.args = {
  containerPort: 8080,
  resource: {
    kind: 'Pod',
    cluster: 'cluster1',
    metadata: {
      name: 'my-pod',
      namespace: 'default',
    },
    status: {
      phase: 'Running',
    },
  },
};
ConnectionEstablished.parameters = {
  docs: {
    description: {
      story: 'Success state when port forward is running — shows clickable localhost link.',
    },
  },
};

// Connection failed error state
export const ConnectionFailed = Template.bind({});
ConnectionFailed.storyName = 'Connection failed error state';
ConnectionFailed.args = {
  containerPort: 8080,
  resource: {
    kind: 'Pod',
    cluster: 'cluster1',
    metadata: {
      name: 'my-pod',
      namespace: 'default',
    },
    status: {
      phase: 'Running',
    },
  },
};
ConnectionFailed.parameters = {
  docs: {
    description: {
      story: 'Error state shown when port forward connection fails.',
    },
  },
};

// Port already in use error
export const PortAlreadyInUse = Template.bind({});
PortAlreadyInUse.storyName = 'Port already in use error';
PortAlreadyInUse.args = {
  containerPort: 8080,
  resource: {
    kind: 'Pod',
    cluster: 'cluster1',
    metadata: {
      name: 'my-pod',
      namespace: 'default',
    },
    status: {
      phase: 'Running',
    },
  },
};
PortAlreadyInUse.parameters = {
  docs: {
    description: {
      story: 'Error state when the requested local port is already in use.',
    },
  },
};

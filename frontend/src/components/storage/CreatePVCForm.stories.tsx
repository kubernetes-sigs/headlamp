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
import { TestContext } from '../../test';
import CreatePVCForm, { CreatePVCFormProps } from './CreatePVCForm';

export default {
  title: 'pvc/CreatePVCForm',
  component: CreatePVCForm,
  argTypes: { onChange: { action: 'changed' } },
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<CreatePVCFormProps> = args => <CreatePVCForm {...args} />;

export const Empty = Template.bind({});
Empty.args = {
  resource: {},
};

export const Prefilled = Template.bind({});
Prefilled.args = {
  resource: {
    metadata: {
      name: 'app-data',
      namespace: 'default',
      labels: { app: 'my-app', tier: 'backend' },
    },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: {
        requests: {
          storage: '5Gi',
        },
      },
      storageClassName: 'standard',
    },
  },
};

export const WithVolumeName = Template.bind({});
WithVolumeName.args = {
  resource: {
    metadata: {
      name: 'static-pvc',
      namespace: 'default',
    },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: {
        requests: {
          storage: '10Gi',
        },
      },
      volumeName: 'my-existing-pv',
    },
  },
};

export const ReadWriteMany = Template.bind({});
ReadWriteMany.args = {
  resource: {
    metadata: {
      name: 'shared-storage',
      namespace: 'apps',
    },
    spec: {
      accessModes: ['ReadWriteMany'],
      resources: {
        requests: {
          storage: '20Gi',
        },
      },
      storageClassName: 'nfs-client',
    },
  },
};

export const MinimalValid = Template.bind({});
MinimalValid.args = {
  resource: {
    metadata: {
      name: 'minimal-pvc',
    },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: {
        requests: {
          storage: '1Gi',
        },
      },
    },
  },
};

export const MultipleAccessModes = Template.bind({});
MultipleAccessModes.args = {
  resource: {
    metadata: {
      name: 'multi-access-pvc',
      namespace: 'default',
    },
    spec: {
      accessModes: ['ReadWriteOnce', 'ReadOnlyMany'],
      resources: {
        requests: {
          storage: '10Gi',
        },
      },
      storageClassName: 'standard',
    },
  },
};

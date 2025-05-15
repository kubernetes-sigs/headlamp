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
import { KubeObjectInterface } from '../../../lib/k8s/KubeObject';
import { TestContext } from '../../../test';
import {
  MetadataDisplay as MetadataDisplayComponent,
  MetadataDisplayProps,
} from './MetadataDisplay';

export default {
  title: 'Resource/MetadataDisplay',
  component: MetadataDisplayComponent,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<MetadataDisplayProps<any>> = args => <MetadataDisplayComponent {...args} />;

const mockResource: KubeObjectInterface = {
  kind: 'MyKind',
  apiVersion: 'v1',
  metadata: {
    name: 'my-new-kind',
    namespace: 'kube-system',
    uid: '123',
    resourceVersion: '216658365',
    creationTimestamp: '2021-06-02',
    selfLink: '',
    labels: {
      label1: 'My Label 1',
      label2: 'My Label 2',
      label3: 'My Label 3',
    },
  },
};

export const MetadataDisplay = Template.bind({});
MetadataDisplay.args = {
  resource: mockResource,
};

export const WithOwnerReferences = Template.bind({});
WithOwnerReferences.args = {
  resource: {
    ...mockResource,
    metadata: {
      ...mockResource.metadata,
      ownerReferences: [
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: 'kube-scheduler',
          uid: '321',
          controller: true,
          blockOwnerDeletion: true,
        },
      ],
    },
  },
};

export const WithExtraRows = Template.bind({});
WithExtraRows.args = {
  resource: mockResource,
  extraRows: [
    {
      name: 'Some extra label 1',
      value: 'Some extra value 1',
    },
    {
      name: 'Some extra label 2',
      value: 'Some extra value 2',
    },
    {
      name: 'Some extra label 3',
      value: 'Some extra value 3',
    },
  ],
};

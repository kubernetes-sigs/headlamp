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
import ClusterChooser from './ClusterChooser';

export default {
  title: 'cluster/ClusterChooser',
  component: ClusterChooser,
  parameters: {
    docs: {
      description: {
        component:
          'A button component for selecting clusters. Shows the current cluster name and handles click events.',
      },
    },
  },
  argTypes: {
    cluster: {
      control: 'text',
      description: 'The name of the current cluster',
    },
    clickHandler: {
      action: 'clicked',
      description: 'Callback fired when the button is clicked',
    },
  },
} as Meta;

const Template: StoryFn = args => {
  const defaultProps = {
    clickHandler: () => {},
    ...args,
  };
  return <ClusterChooser {...defaultProps} />;
};

export const Normal = Template.bind({});
Normal.args = {
  cluster: 'my-cluster',
};

export const LongClusterName = Template.bind({});
LongClusterName.args = {
  cluster: 'very-long-kubernetes-cluster-name-that-should-be-truncated',
};

export const NoCluster = Template.bind({});
NoCluster.args = {
  cluster: undefined,
};

export const SpecialCharacters = Template.bind({});
SpecialCharacters.args = {
  cluster: 'test-cluster!@#$%^&*()',
};

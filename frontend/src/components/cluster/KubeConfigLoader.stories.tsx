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
import { TestContext } from '../../test';
import { PureKubeConfigLoader, PureKubeConfigLoaderProps, Step } from './KubeConfigLoader';

/**
 * KubeConfigLoader Stories
 *
 * This component allows users to upload a kubeconfig file to import Kubernetes clusters.
 * The stories demonstrate all possible states using the presentation (Pure) component.
 */

const mockFileContent = {
  clusters: [
    { name: 'prod-cluster', cluster: { server: 'https://prod.k8s.example.com' } },
    { name: 'staging-cluster', cluster: { server: 'https://staging.k8s.example.com' } },
    { name: 'dev-cluster', cluster: { server: 'https://dev.k8s.example.com' } },
  ],
  users: [{ name: 'admin', user: { token: 'abc' } }],
  contexts: [
    { name: 'production', context: { cluster: 'prod-cluster', user: 'admin' } },
    { name: 'staging', context: { cluster: 'staging-cluster', user: 'admin' } },
    { name: 'development', context: { cluster: 'dev-cluster', user: 'admin' } },
  ],
  currentContext: 'production',
};

export default {
  title: 'cluster/KubeConfigLoader',
  component: PureKubeConfigLoader,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'A dialog component for importing Kubernetes clusters from kubeconfig files. Demonstrates all states including file upload, cluster selection, validation, and error handling.',
      },
    },
  },
  argTypes: {
    step: {
      control: 'select',
      options: [
        Step.LoadKubeConfig,
        Step.SelectClusters,
        Step.ValidateKubeConfig,
        Step.ConfigureClusters,
        Step.Success,
      ],
      labels: {
        [Step.LoadKubeConfig]: 'Load KubeConfig',
        [Step.SelectClusters]: 'Select Clusters',
        [Step.ValidateKubeConfig]: 'Validate KubeConfig',
        [Step.ConfigureClusters]: 'Configure Clusters',
        [Step.Success]: 'Success',
      },
      description: 'The current step of the KubeConfigLoader component',
    },
    onDrop: { action: 'dropped' },
    onCheckboxChange: { action: 'checkbox changed' },
    onNext: { action: 'next' },
    onBack: { action: 'back' },
    onFinish: { action: 'finish' },
    onCancel: { action: 'cancel' },
  },
} as Meta<PureKubeConfigLoaderProps>;

const Template: StoryFn<PureKubeConfigLoaderProps> = args => <PureKubeConfigLoader {...args} />;

/**
 * FILE UPLOAD STATE
 * Shows the initial drag-and-drop interface where users upload their kubeconfig file
 */
export const FileUpload = Template.bind({});
FileUpload.args = {
  step: Step.LoadKubeConfig,
  fileContent: { clusters: [], users: [], contexts: [], currentContext: '' },
  selectedClusters: [],
};
FileUpload.parameters = {
  docs: {
    description: {
      story:
        'Initial state showing the file upload area with drag-and-drop support. Users can click "Choose file" button or drag a kubeconfig file directly into the dropzone.',
    },
  },
};

/**
 * CLUSTER SELECTION STATE
 * Shows available clusters from the uploaded kubeconfig file
 */
export const SelectingClusters = Template.bind({});
SelectingClusters.args = {
  step: Step.SelectClusters,
  fileContent: mockFileContent,
  selectedClusters: ['production', 'staging'],
};
SelectingClusters.parameters = {
  docs: {
    description: {
      story:
        'After a valid kubeconfig file is uploaded, users see a list of available clusters and can select which ones to import.',
    },
  },
};

/**
 * VALIDATING STATE
 * Shows loading spinner while the system validates selected clusters
 */
export const ValidatingClusters = Template.bind({});
ValidatingClusters.args = {
  step: Step.ValidateKubeConfig,
  fileContent: mockFileContent,
  selectedClusters: ['production', 'staging'],
};

/**
 * CONFIGURING STATE
 * Shows loading spinner while clusters are being set up in Headlamp
 */
export const ConfiguringClusters = Template.bind({});
ConfiguringClusters.args = {
  step: Step.ConfigureClusters,
  fileContent: mockFileContent,
  selectedClusters: ['production', 'staging'],
};

/**
 * SUCCESS STATE
 * Shows success message after clusters are successfully imported
 */
export const SuccessfulImport = Template.bind({});
SuccessfulImport.args = {
  step: Step.Success,
  fileContent: mockFileContent,
  selectedClusters: ['production', 'staging'],
};

/**
 * ERROR: INVALID YAML
 * Shows error when the uploaded file is not a valid YAML kubeconfig
 */
export const InvalidYAMLError = Template.bind({});
InvalidYAMLError.args = {
  step: Step.LoadKubeConfig,
  error: 'Invalid kubeconfig file: unexpected end of file at line 45',
  fileContent: { clusters: [], users: [], contexts: [], currentContext: '' },
  selectedClusters: [],
};

/**
 * ERROR: DUPLICATE CLUSTERS
 * Shows error when selected clusters already exist in the system
 */
export const DuplicateClusterError = Template.bind({});
DuplicateClusterError.args = {
  step: Step.SelectClusters,
  error: 'Duplicate cluster: production in the list. Please edit the context name.',
  fileContent: mockFileContent,
  selectedClusters: ['production', 'staging'],
};

/**
 * ERROR: TIMEOUT
 * Shows error when file parsing or cluster setup times out
 */
export const TimeoutError = Template.bind({});
TimeoutError.args = {
  step: Step.SelectClusters,
  error: 'Operation timed out. The file is too large or the connection is too slow.',
  fileContent: mockFileContent,
  selectedClusters: ['production', 'staging'],
};

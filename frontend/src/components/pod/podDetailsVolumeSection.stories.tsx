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
import { KubeObjectInterface } from '../../lib/k8s/KubeObject';
import { TestContext } from '../../test';
import { VolumeSection, VolumeSectionProps } from '../common';

const dummyResource: KubeObjectInterface = {
  kind: 'Pod',
  apiVersion: 'v1',
  metadata: {
    name: 'kube-example',
    namespace: 'kube-system',
    uid: 'example text',
    resourceVersion: '1234',
    creationTimestamp: '2023-10-11T16:02:36Z',
  },
  spec: {
    volumes: [
      {
        name: 'ca-certs',
        hostPath: {
          path: '/etc/ssl/certs',
          type: 'DirectoryOrCreate',
        },
      },
      {
        name: 'etc-ca-certificates',
        hostPath: {
          path: '/etc/ca-certificates',
          type: 'DirectoryOrCreate',
        },
      },
      {
        name: 'flexvolume-dir',
        hostPath: {
          path: '/usr/libexec/kubernetes/kubelet-plugins/volume/exec',
          type: 'DirectoryOrCreate',
        },
      },
      {
        name: 'k8s-certs',
        hostPath: {
          path: '/var/lib/minikube/certs',
          type: 'DirectoryOrCreate',
        },
      },
      {
        name: 'kubeconfig',
        hostPath: {
          path: '/etc/kubernetes/controller-manager.conf',
          type: 'FileOrCreate',
        },
      },
      {
        name: 'usr-local-share-ca-certificates',
        hostPath: {
          path: '/usr/local/share/ca-certificates',
          type: 'DirectoryOrCreate',
        },
      },
      {
        name: 'usr-share-ca-certificates',
        hostPath: {
          path: '/usr/share/ca-certificates',
          type: 'DirectoryOrCreate',
        },
      },
    ],
  },
};

const dummyResourceShort: KubeObjectInterface = {
  kind: 'Pod',
  apiVersion: 'v1',
  metadata: {
    name: 'kube-example',
    namespace: 'kube-system',
    uid: 'example text',
    resourceVersion: '1234',
    creationTimestamp: '2023-10-11T16:02:36Z',
  },
  spec: {
    volumes: [
      {
        name: 'ca-certs',
        hostPath: {
          path: '/etc/ssl/certs',
          type: 'DirectoryOrCreate',
        },
      },
      {
        name: 'etc-ca-certificates',
        hostPath: {
          path: '/etc/ca-certificates',
          type: 'DirectoryOrCreate',
        },
      },
    ],
  },
};

const dummyResourceEmpty: KubeObjectInterface = {
  kind: 'Pod',
  apiVersion: 'v1',
  metadata: {
    name: 'kube-example',
    namespace: 'kube-system',
    uid: 'example text',
    resourceVersion: '1234',
    creationTimestamp: '2023-10-11T16:02:36Z',
  },
  spec: {
    volumes: [],
  },
};

export default {
  title: 'Pod/PodVolumeSectionDetailsView',
  component: VolumeSection,
  argTypes: {},
  decorators: [
    Story => {
      return <Story />;
    },
  ],
} as Meta;

const Template: StoryFn<VolumeSectionProps> = args => {
  return (
    <TestContext>
      <VolumeSection {...args} />
    </TestContext>
  );
};

export const Successful = Template.bind({});
Successful.args = {
  resource: dummyResource,
};

export const Short = Template.bind({});
Short.args = {
  resource: dummyResourceShort,
};

export const Empty = Template.bind({});
Empty.args = {
  resource: dummyResourceEmpty,
};

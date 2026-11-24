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
import { http, HttpResponse } from 'msw';
import React from 'react';
import DaemonSet from '../../lib/k8s/daemonSet';
import { TestContext } from '../../test';
import CreateDaemonSetForm, {
  CreateDaemonSetFormProps,
  DaemonSetDraft,
} from './CreateDaemonSetForm';

export default {
  title: 'DaemonSet/CreateDaemonSetForm',
  component: CreateDaemonSetForm,
  argTypes: { onChange: { action: 'changed' } },
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          // The base mock only matches localhost:4466; the static Storybook build
          // sends this request to its own origin.
          http.get('*/api/v1/namespaces', () =>
            HttpResponse.json({
              kind: 'NamespaceList',
              apiVersion: 'v1',
              metadata: {},
              items: [
                {
                  kind: 'Namespace',
                  apiVersion: 'v1',
                  metadata: {
                    name: 'default',
                    creationTimestamp: '2024-08-16T11:12:37.179Z',
                    uid: '123456',
                  },
                  spec: { finalizers: ['kubernetes'] },
                  status: { phase: 'Active' },
                },
              ],
            })
          ),
        ],
      },
    },
  },
} as Meta;

/** Wraps the form in local state so the on-mount seeds (selector,
 *  mirrored pod labels) and user edits show up in the preview.
 *  `onChange` is still forwarded to the Actions panel. */
const Template: StoryFn<CreateDaemonSetFormProps> = args => {
  const [resource, setResource] = React.useState<DaemonSetDraft | undefined>(args.resource);
  // Use the resource arg again when it is changed from Storybook Controls. Only an actual
  // change replaces the draft, so the labels seeded on mount are kept.
  const [resourceArg, setResourceArg] = React.useState(args.resource);
  if (args.resource !== resourceArg) {
    setResourceArg(args.resource);
    setResource(args.resource);
  }
  return (
    <CreateDaemonSetForm
      {...args}
      resource={resource}
      onChange={next => {
        setResource(next);
        args.onChange?.(next);
      }}
    />
  );
};

/** Brand-new DaemonSet, as created from `DaemonSet.getBaseObject()`. Pod
 *  labels get seeded by mirroring the selector. */
export const Default = Template.bind({});
Default.args = {
  resource: DaemonSet.getBaseObject(),
};

/** Pre-filled with valid values. */
export const Filled = Template.bind({});
Filled.args = {
  resource: {
    apiVersion: 'apps/v1',
    kind: 'DaemonSet',
    metadata: {
      name: 'my-daemonset',
      namespace: 'default',
      labels: { app: 'headlamp' },
    },
    spec: {
      selector: { matchLabels: { app: 'headlamp' } },
      template: {
        metadata: {
          labels: { app: 'headlamp' },
        },
        spec: {
          containers: [
            {
              name: 'node-exporter',
              image: 'prom/node-exporter:latest',
              ports: [{ containerPort: 9100 }],
              imagePullPolicy: 'Always',
            },
          ],
          nodeName: '',
        },
      },
    },
  },
};

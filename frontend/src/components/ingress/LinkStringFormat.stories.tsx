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
import Ingress from '../../lib/k8s/ingress';
import { LinkStringFormat, LinkStringFormatProps } from './Details';

export default {
  title: 'ingress/LinkStringFormat',
  component: LinkStringFormat,
  argTypes: {},
} as Meta;

const Template: StoryFn<LinkStringFormatProps> = args => <LinkStringFormat {...args} />;

const noPath = new Ingress({
  kind: 'Ingress',
  metadata: {
    name: 'test',
    namespace: 'test',
    uid: '',
    creationTimestamp: '',
  },
  spec: {
    rules: [
      {
        host: 'examplehost.com',
        http: {
          paths: [
            {
              path: '/',
              pathType: 'Prefix',
              backend: {
                service: {
                  name: 'test',
                  port: {
                    number: 80,
                  },
                },
              },
            },
          ],
        },
      },
    ],
  },
});

const onePath = new Ingress({
  kind: 'Ingress',
  metadata: {
    name: 'test',
    namespace: 'test',
    uid: '',
    creationTimestamp: '',
  },
  spec: {
    rules: [
      {
        host: 'examplehost.com',
        http: {
          paths: [
            {
              path: '/pathA',
              pathType: 'Prefix',
              backend: {
                service: {
                  name: 'test',
                  port: {
                    number: 80,
                  },
                },
              },
            },
          ],
        },
      },
    ],
  },
});

const multiplePath = new Ingress({
  kind: 'Ingress',
  metadata: {
    name: 'test',
    namespace: 'test',
    uid: '',
    creationTimestamp: '',
  },
  spec: {
    rules: [
      {
        host: 'examplehost.com',
        http: {
          paths: [
            {
              path: '/pathA',
              pathType: 'Prefix',
              backend: {
                service: {
                  name: 'test',
                  port: {
                    number: 80,
                  },
                },
              },
            },
            {
              path: '/pathB',
              pathType: 'Prefix',
              backend: {
                service: {
                  name: 'test',
                  port: {
                    number: 80,
                  },
                },
              },
            },
            {
              path: '/pathC',
              pathType: 'Prefix',
              backend: {
                service: {
                  name: 'test',
                  port: {
                    number: 80,
                  },
                },
              },
            },
          ],
        },
      },
    ],
  },
});

export const Empty = Template.bind({});
Empty.args = {
  url: 'exampleurl.com',
  item: noPath,
  urlPath: '/',
};

export const soloPath = Template.bind({});
soloPath.args = {
  url: 'exampleurl.com',
  item: onePath,
  urlPath: '/pathA',
};

export const morePath = Template.bind({});
morePath.args = {
  url: 'exampleurl.com',
  item: multiplePath,
  urlPath: '/pathB',
};

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
import { TestContext } from '../../test';
import Details from './ClassDetails';
import { RESOURCE_DEFAULT_INGRESS_CLASS, RESOURCE_INGRESS_CLASS } from './storyHelper';

export default {
  title: 'IngressClass/DetailsView',
  component: Details,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext routerMap={{ name: 'my-ic' }}>
          <Story />
        </TestContext>
      );
    },
  ],
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          http.get('http://localhost:4466/apis/networking.k8s.io/v1/ingressclasses', () =>
            HttpResponse.error()
          ),
          http.get('http://localhost:4466/api/v1/namespaces/default/events', () =>
            HttpResponse.json({
              kind: 'EventList',
              items: [],
              metadata: {},
            })
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return <Details />;
};

export const Basic = Template.bind({});
Basic.args = {
  ingressJson: RESOURCE_INGRESS_CLASS,
};
Basic.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/apis/networking.k8s.io/v1/ingressclasses/my-ic', () =>
          HttpResponse.json(RESOURCE_INGRESS_CLASS)
        ),
      ],
    },
  },
};

export const WithDefault = Template.bind({});
WithDefault.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/apis/networking.k8s.io/v1/ingressclasses/my-ic', () =>
          HttpResponse.json(RESOURCE_DEFAULT_INGRESS_CLASS)
        ),
      ],
    },
  },
};

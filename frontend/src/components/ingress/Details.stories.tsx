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
import Details from './Details';
import { PORT_INGRESS, RESOURCE_INGRESS, WILDCARD_TLS_INGRESS } from './storyHelper';

export default {
  title: 'Ingress/DetailsView',
  component: Details,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext routerMap={{ name: 'my-ingress' }}>
          <Story />
        </TestContext>
      );
    },
  ],
  parameters: {
    msw: {
      handlers: {
        baseStory: [
          http.get('http://localhost:4466/apis/networking.k8s.io/v1/ingresses', () =>
            HttpResponse.json({})
          ),
          http.get('http://localhost:4466/apis/extensions/v1beta1/ingresses', () =>
            HttpResponse.error()
          ),
          http.get('http://localhost:4466/api/v1/namespaces/default/events', () =>
            HttpResponse.json({
              kind: 'EventList',
              items: [],
              metadata: {},
            })
          ),
          http.post(
            'http://localhost:4466/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
            () => HttpResponse.json({ status: { allowed: true, reason: '', code: 200 } })
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return <Details />;
};

export const WithTLS = Template.bind({});
WithTLS.args = {
  ingressJson: PORT_INGRESS,
};
WithTLS.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/apis/networking.k8s.io/v1/ingresses/my-ingress', () =>
          HttpResponse.json(PORT_INGRESS)
        ),
      ],
    },
  },
};

export const WithResource = Template.bind({});
WithResource.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/apis/networking.k8s.io/v1/ingresses/my-ingress', () =>
          HttpResponse.json(RESOURCE_INGRESS)
        ),
      ],
    },
  },
};

export const WithWildcardTLS = Template.bind({});
WithWildcardTLS.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/apis/networking.k8s.io/v1/ingresses/my-ingress', () =>
          HttpResponse.json(WILDCARD_TLS_INGRESS)
        ),
      ],
    },
  },
};

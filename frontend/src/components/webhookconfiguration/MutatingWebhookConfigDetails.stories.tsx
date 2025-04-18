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
import MutatingWebhookConfigDetails from './MutatingWebhookConfigDetails';
import { createMWC } from './storyHelper';

export default {
  title: 'WebhookConfiguration/MutatingWebhookConfig/Details',
  component: MutatingWebhookConfigDetails,
  argTypes: {},
  decorators: [
    Story => {
      return <Story />;
    },
  ],
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          http.get(
            'http://localhost:4466/apis/admissionregistration.k8s.io/v1/mutatingwebhookconfigurations',
            () => HttpResponse.error()
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return (
    <TestContext routerMap={{ name: 'my-mwc' }}>
      <MutatingWebhookConfigDetails />;
    </TestContext>
  );
};

export const WithService = Template.bind({});

WithService.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/apis/admissionregistration.k8s.io/v1/mutatingwebhookconfigurations/my-mwc',
          () => HttpResponse.json(createMWC(true))
        ),
      ],
    },
  },
};

export const WithURL = Template.bind({});

WithURL.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/apis/admissionregistration.k8s.io/v1/mutatingwebhookconfigurations/my-mwc',
          () => HttpResponse.json(createMWC(false))
        ),
      ],
    },
  },
};

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

import Container from '@mui/material/Container';
import { Meta, StoryFn } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { API_BASE, TestContext } from '../../test';
import ResourceClaimTemplateList from './ResourceClaimTemplateList';
import { RESOURCE_CLAIM_TEMPLATE_DUMMY_DATA } from './storyHelper';

const listUrl = `${API_BASE}/apis/resource.k8s.io/v1/resourceclaimtemplates`;

const templateList = (items: typeof RESOURCE_CLAIM_TEMPLATE_DUMMY_DATA) =>
  HttpResponse.json({
    kind: 'ResourceClaimTemplateList',
    items,
    metadata: {},
  });

export default {
  title: 'ResourceClaimTemplate/List',
  component: ResourceClaimTemplateList,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext>
          <Story />
        </TestContext>
      );
    },
  ],
  parameters: {
    msw: {
      handlers: {
        story: [http.get(listUrl, () => templateList(RESOURCE_CLAIM_TEMPLATE_DUMMY_DATA))],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return (
    <Container maxWidth="xl">
      <ResourceClaimTemplateList />
    </Container>
  );
};

export const ResourceClaimTemplates = Template.bind({});

export const Loading = Template.bind({});
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [http.get(listUrl, () => new Promise(() => {}))],
    },
  },
};

export const Empty = Template.bind({});
Empty.parameters = {
  msw: {
    handlers: {
      story: [http.get(listUrl, () => templateList([]))],
    },
  },
};

export const Error = Template.bind({});
Error.parameters = {
  msw: {
    handlers: {
      story: [http.get(listUrl, () => HttpResponse.error())],
    },
  },
};

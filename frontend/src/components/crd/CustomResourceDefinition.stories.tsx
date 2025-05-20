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
import { TestContext, TestContextProps } from '../../test';
import CustomResourceDefinitionDetails from './Details';
import CustomResourceDefinitionList from './List';
import { mockCRD, mockCRList } from './storyHelper';

interface MockerStory {
  viewType: 'list' | 'details';
  name?: string;
  namespace?: string;
}

export default {
  title: 'crd/CustomResourceDefinition',
  argTypes: {},
  decorators: [Story => <Story />],
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          http.get(
            'http://localhost:4466/apis/apiextensions.k8s.io/v1beta1/customresourcedefinitions',
            () => HttpResponse.error()
          ),
          http.get(
            'http://localhost:4466/apis/apiextensions.k8s.io/v1/customresourcedefinitions',
            () =>
              HttpResponse.json({
                kind: 'List',
                metadata: {},
                items: [mockCRD],
              })
          ),
          http.get(
            'http://localhost:4466/apis/apiextensions.k8s.io/v1/customresourcedefinitions/mydefinition.phonyresources.io',
            () => HttpResponse.json(mockCRD)
          ),
          http.get('http://localhost:4466/apis/my.phonyresources.io/v1/mycustomresources', () =>
            HttpResponse.json({
              kind: 'List',
              metadata: {},
              items: mockCRList,
            })
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn<MockerStory> = args => {
  const { name, namespace, viewType = 'list' } = args;
  const routerMap: TestContextProps['routerMap'] = {};

  if (!!name) {
    routerMap['name'] = name;
  }
  if (!!namespace) {
    routerMap['namespace'] = namespace;
  }

  return (
    <TestContext routerMap={routerMap}>
      {viewType === 'list' ? <CustomResourceDefinitionList /> : <CustomResourceDefinitionDetails />}
    </TestContext>
  );
};

export const List = Template.bind({});
List.args = {};

export const Details = Template.bind({});
Details.args = {
  viewType: 'details',
  name: 'mydefinition.phonyresources.io',
};

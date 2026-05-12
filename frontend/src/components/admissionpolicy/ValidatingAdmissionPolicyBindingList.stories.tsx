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
import ValidatingAdmissionPolicyBinding from '../../lib/k8s/validatingAdmissionPolicyBinding';
import { TestContext } from '../../test';
import { generateK8sResourceList } from '../../test/mocker';
import { createVAPBinding } from './storyHelper';
import List from './ValidatingAdmissionPolicyBindingList';

const VAPBindingTemplate = createVAPBinding();
VAPBindingTemplate.metadata.name = 'vap-binding-test-{{i}}';

const objList = generateK8sResourceList(VAPBindingTemplate, {
  numResults: 5,
  instantiateAs: ValidatingAdmissionPolicyBinding,
}).map(it => it.jsonData);

export default {
  title: 'AdmissionPolicy/ValidatingAdmissionPolicyBinding/List',
  component: List,
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
} as Meta;

const Template: StoryFn = () => {
  return (
    <Container maxWidth="xl">
      <List />
    </Container>
  );
};

export const Items = Template.bind({});
Items.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicybindings',
          () =>
            HttpResponse.json({
              kind: 'ValidatingAdmissionPolicyBindingList',
              items: objList,
              metadata: {},
            })
        ),
      ],
    },
  },
};

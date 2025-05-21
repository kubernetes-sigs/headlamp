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
import { BASE_SC } from './storyHelper';

export default {
  title: 'StorageClass/DetailsView',
  component: Details,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext routerMap={{ name: 'my-sc' }}>
          <Story />
        </TestContext>
      );
    },
  ],
} as Meta;

const Template: StoryFn = () => {
  return <Details />;
};

export const Base = Template.bind({});
Base.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/apis/storage.k8s.io/v1/storageclasses/my-sc', () =>
          HttpResponse.json(BASE_SC)
        ),
        http.get('http://localhost:4466/apis/storage.k8s.io/v1/storageclasses', () =>
          HttpResponse.error()
        ),
      ],
    },
  },
};

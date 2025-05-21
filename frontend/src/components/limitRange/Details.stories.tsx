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
import { LimitRangeDetails } from './Details';
import { LIMIT_RANGE_DUMMY_DATA } from './storyHelper';

export default {
  title: 'LimitRange/DetailsView',
  component: LimitRangeDetails,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext routerMap={{ name: 'my-lr' }}>
          <Story />
        </TestContext>
      );
    },
  ],
} as Meta;

const Template: StoryFn = () => {
  return <LimitRangeDetails />;
};

export const LimitRangeDetail = Template.bind({});
LimitRangeDetail.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/api/v1/limitranges/my-lr', () =>
          HttpResponse.json(LIMIT_RANGE_DUMMY_DATA[0])
        ),
        http.get('http://localhost:4466/api/v1/limitranges', () => HttpResponse.error()),
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
};

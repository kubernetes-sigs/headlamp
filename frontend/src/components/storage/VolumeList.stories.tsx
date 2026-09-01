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
import { API_BASE, TestContext } from '../../test';
import { BASE_PV } from './storyHelper';
import ListView from './VolumeList';

export default {
  title: 'PersistentVolume/ListView',
  component: ListView,
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
  return <ListView />;
};

export const Items = Template.bind({});
Items.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${API_BASE}/api/v1/persistentvolumes`, () =>
          HttpResponse.json({
            kind: 'PersistentVolumeList',
            items: [BASE_PV],
            metadata: {},
          })
        ),
      ],
    },
  },
};

// `capacity` is optional in the Kubernetes API, so the Capacity column has to
// tolerate a PersistentVolume that omits it.
const PV_WITHOUT_CAPACITY = {
  ...BASE_PV,
  metadata: {
    ...BASE_PV.metadata,
    name: 'pv-without-capacity',
    uid: 'abc-5678',
  },
  spec: {
    ...BASE_PV.spec,
    capacity: undefined,
  },
} as unknown as typeof BASE_PV;

export const WithoutCapacity = Template.bind({});
WithoutCapacity.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${API_BASE}/api/v1/persistentvolumes`, () =>
          HttpResponse.json({
            kind: 'PersistentVolumeList',
            items: [PV_WITHOUT_CAPACITY],
            metadata: {},
          })
        ),
      ],
    },
  },
};

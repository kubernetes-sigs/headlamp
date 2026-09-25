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

import { configureStore } from '@reduxjs/toolkit';
import { Meta, StoryFn } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import React from 'react';
import { initialState as configInitialState } from '../../redux/configSlice';
import reducers from '../../redux/reducers/reducers';
import { API_BASE, TestContext } from '../../test';
import { AdvancedSearch } from './AdvancedSearch';

export default {
  title: 'AdvancedSearch/AdvancedSearch',
  component: AdvancedSearch,
  argTypes: {},
} as Meta;

const clusters = ['development', 'staging', 'production'].reduce(
  (result, name) => ({ ...result, [name]: { name } }),
  {}
);

const makeStore = () =>
  configureStore({
    reducer: reducers,
    preloadedState: {
      config: {
        ...configInitialState,
        clusters,
        allClusters: clusters,
      },
    },
  });

const Template: StoryFn = args => (
  <TestContext store={makeStore()} routerMap={{ cluster: 'development+staging' }} urlPrefix="/c">
    <AdvancedSearch {...args} />
  </TestContext>
);

export const Default = Template.bind({});
Default.args = {};
Default.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${API_BASE}/clusters/:cluster/api`, () => HttpResponse.json({ items: [] })),
        http.get(`${API_BASE}/clusters/:cluster/apis`, () => HttpResponse.json({ items: [] })),
        http.get(`${API_BASE}/clusters/:cluster/api/v1/namespaces`, () =>
          HttpResponse.json({
            apiVersion: 'v1',
            kind: 'NamespaceList',
            metadata: {},
            items: [],
          })
        ),
      ],
    },
  },
};

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
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import filterReducer from '../../redux/filterSlice';
import { LabelSelectorInput } from './LabelSelectorInput';

const createStore = (initialLabelSelector = '') => {
  return configureStore({
    reducer: {
      filter: filterReducer,
    },
    preloadedState: {
      filter: {
        namespaces: new Set<string>(),
        labelSelector: initialLabelSelector,
      },
    },
  });
};

export default {
  title: 'LabelSelectorInput',
  component: LabelSelectorInput,
  decorators: [
    Story => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
} as Meta;

const Template: StoryFn = args => {
  const store = createStore(args.initialValue as string);
  return (
    <Provider store={store}>
      <LabelSelectorInput />
    </Provider>
  );
};

export const Empty = Template.bind({});
Empty.args = {
  initialValue: '',
};

export const WithValue = Template.bind({});
WithValue.args = {
  initialValue: 'app=nginx',
};

export const MultipleLabels = Template.bind({});
MultipleLabels.args = {
  initialValue: 'app=nginx,env=production',
};

export const ComplexSelector = Template.bind({});
ComplexSelector.args = {
  initialValue: 'app=nginx,env in (prod,staging),tier!=backend',
};

export const LongValue = Template.bind({});
LongValue.args = {
  initialValue: 'app=nginx,environment=production,tier=frontend,version=v1.0.0,region=us-west-2',
};

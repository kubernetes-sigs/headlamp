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

import Button from '@mui/material/Button';
import { configureStore } from '@reduxjs/toolkit';
import { Meta, StoryFn } from '@storybook/react';
import reducers from '../../redux/reducers/reducers';
import { TestContext } from '../../test';
import SectionFilterHeader, { SectionFilterHeaderProps } from './SectionFilterHeader';

// A fresh store per story so the namespace filter state never leaks between
// stories (the component dispatches setNamespaceFilter and reads it back).
function makeStore(namespaces: string[] = []) {
  return configureStore({
    reducer: reducers,
    preloadedState: { filter: { namespaces: new Set(namespaces), search: '' } } as any,
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
  });
}

export default {
  title: 'SectionFilterHeader',
  component: SectionFilterHeader,
} as Meta;

const Template: StoryFn<SectionFilterHeaderProps & { namespaces?: string[] }> = ({
  namespaces,
  ...args
}) => (
  <TestContext store={makeStore(namespaces)}>
    <SectionFilterHeader {...args} />
  </TestContext>
);

export const Default = Template.bind({});
Default.args = {
  title: 'Pods',
};

export const WithNamespaceFilter = Template.bind({});
WithNamespaceFilter.args = {
  title: 'Pods',
  namespaces: ['default'],
};

export const NoNamespaceFilter = Template.bind({});
NoNamespaceFilter.args = {
  title: 'Pods',
  noNamespaceFilter: true,
};

export const WithActions = Template.bind({});
WithActions.args = {
  title: 'Pods',
  actions: [
    <Button key="create" variant="contained">
      Create
    </Button>,
  ],
};

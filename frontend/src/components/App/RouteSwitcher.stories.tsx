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
import React from 'react';
import { Route } from '../../lib/router';
import { setRoute } from '../../redux/routesSlice';
import store from '../../redux/stores/store';
import { TestContext } from '../../test';
import { DefaultSidebars } from '../Sidebar';
import RouteSwitcher from './RouteSwitcher';

const storyData = {
  title: 'routes/RouteSwitcher',
  component: RouteSwitcher,
  argTypes: {},
} as Meta;
export default storyData;

const Template: StoryFn<{ route: Route }> = args => {
  const { route } = args;

  React.useEffect(() => {
    store.dispatch(setRoute(route));
  }, []);

  return (
    <TestContext store={store} urlPrefix={route.path}>
      <RouteSwitcher requiresToken={() => false} />
    </TestContext>
  );
};

export const Default = Template.bind({});
Default.args = {
  route: {
    path: '/test',
    component: () => {
      throw { message: 'Oh no! I just crashed!', stack: 'Here is the stack trace' };
    },
    useClusterURL: false,
    noAuthRequired: true,
    name: 'My Test Route',
    sidebar: {
      item: 'home',
      sidebar: DefaultSidebars.HOME,
    },
  },
};

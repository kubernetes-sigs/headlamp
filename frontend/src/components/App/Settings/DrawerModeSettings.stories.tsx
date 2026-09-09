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
import drawerModeReducer from '../../../redux/drawerModeSlice';
import { TestContext } from '../../../test';
import DrawerModeSettings from './DrawerModeSettings';

// A store preloaded with a fixed drawer state keeps the snapshot deterministic
// (the real initial state is read from localStorage).
function storeWith(isDetailDrawerEnabled: boolean) {
  return configureStore({
    reducer: { drawerMode: drawerModeReducer },
    preloadedState: { drawerMode: { isDetailDrawerEnabled } },
  });
}

export default {
  title: 'Settings/DrawerModeSettings',
  component: DrawerModeSettings,
} as Meta<typeof DrawerModeSettings>;

const Template: StoryFn<{ enabled: boolean }> = ({ enabled }) => (
  <TestContext store={storeWith(enabled)}>
    <DrawerModeSettings />
  </TestContext>
);

export const DrawerEnabled = Template.bind({});
DrawerEnabled.args = { enabled: true };

export const FullPage = Template.bind({});
FullPage.args = { enabled: false };

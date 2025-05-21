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
import VersionDialogComponent from './VersionDialog';

const store = configureStore({
  reducer: (state = { ui: { isVersionDialogOpen: false } }) => state,
  preloadedState: {
    ui: {
      isVersionDialogOpen: true,
    },
  },
});

export default {
  title: 'Version Dialog',
  component: VersionDialogComponent,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <Provider store={store}>
          <Story />
        </Provider>
      );
    },
  ],
} as Meta;

// Let's override this function so we don't have to change the snapshot at every version change.
const getVersion = () => ({
  VERSION: '0.0.1',
  GIT_VERSION: 'abc123abc123abc123abc123abc123abc123abc123abc123abc123',
});

const Template: StoryFn = () => {
  return <VersionDialogComponent getVersion={getVersion} />;
};

export const VersionDialog = Template.bind({});

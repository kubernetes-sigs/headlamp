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
import reducers from '../../../redux/reducers/reducers';
import { setShortcutsDialogOpen } from '../../../redux/shortcutsSlice';
import store from '../../../redux/stores/store';
import ShortcutsSettings from './ShortcutsSettings';

export default {
  title: 'Settings/ShortcutsSettings',
  component: ShortcutsSettings,
  decorators: [
    Story => (
      <Provider store={store}>
        <MemoryRouter>
          <Story />
        </MemoryRouter>
      </Provider>
    ),
  ],
} as Meta<typeof ShortcutsSettings>;

const Template: StoryFn<typeof ShortcutsSettings> = () => {
  store.dispatch(setShortcutsDialogOpen(true));
  return <ShortcutsSettings />;
};

export const Default = Template.bind({});
Default.args = {};

export const ModifiedShortcut: StoryFn<typeof ShortcutsSettings> = () => {
  const storyStore = configureStore({
    reducer: reducers,
    preloadedState: {
      shortcuts: {
        ...store.getState().shortcuts,
        shortcuts: {
          ...store.getState().shortcuts.shortcuts,
          GLOBAL_SEARCH: {
            ...store.getState().shortcuts.shortcuts.GLOBAL_SEARCH,
            key: 'ctrl+k',
          },
        },
        isShortcutsDialogOpen: true,
      },
    },
  });

  return (
    <Provider store={storyStore}>
      <MemoryRouter>
        <ShortcutsSettings />
      </MemoryRouter>
    </Provider>
  );
};

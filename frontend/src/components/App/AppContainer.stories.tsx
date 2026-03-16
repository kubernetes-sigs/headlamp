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
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { Provider } from 'react-redux';
import i18n from '../../i18n/config';
import store from '../../redux/stores/store';
import AppContainer from './AppContainer';

const withEnv = (Story: React.ComponentType) => {
  const prev = (window as any).desktopApi;
  (window as any).desktopApi = {
    send: () => {},
    receive: () => {},
  };

  React.useEffect(() => {
    return () => {
      if (prev === undefined) {
        delete (window as any).desktopApi;
      } else {
        (window as any).desktopApi = prev;
      }
    };
  }, []);

  return (
    <Provider store={store}>
      <I18nextProvider i18n={i18n}>
        <Story />
      </I18nextProvider>
    </Provider>
  );
};

export default {
  title: 'App/AppContainer',
  component: AppContainer,
  decorators: [withEnv],
  parameters: {
    layout: 'fullscreen',
    storyshots: { disable: true },
    docs: {
      description: {
        component:
          'The root container for the Headlamp application. It sets up routing, global providers, and the main layout. This story primarily verifies that it renders its children correctly.',
      },
    },
    msw: {
      handlers: [
        http.get('*/plugins', () => HttpResponse.json([])),
        http.get('*/config', () => HttpResponse.json({})),
      ],
    },
  },
} as Meta<typeof AppContainer>;

const Template: StoryFn = args => <AppContainer {...args} />;

export const Default = Template.bind({});

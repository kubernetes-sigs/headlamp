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
import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import Message, { MessageProps } from './Message';

/**
 * What is a story?
 *
 * `npm run storybook` and see.
 *
 * https://storybook.js.org/docs/web-components/get-started/introduction
 *
 * > Storybook is a tool for UI development. It makes development faster and
 * > easier by isolating components. This allows you to work on one component
 * > at a time. You can develop entire UIs without needing to start up a
 * > complex dev stack, force certain data into your database,
 * > or navigate around your application.
 */

const store = configureStore({ reducer: {} });

export default {
  title: 'Message',
  component: Message,
  decorators: [
    Story => (
      <Provider store={store}>
        <MemoryRouter>
          <Story />
        </MemoryRouter>
      </Provider>
    ),
  ],
} as Meta;

const Template: StoryFn<MessageProps> = args => <Message {...args} />;

export const Error = Template.bind({});
Error.args = {
  msg: '',
  error: true,
};

export const SmallAmount = Template.bind({});
SmallAmount.args = {
  msg: '1',
  error: false,
};

export const LargeAmount = Template.bind({});
LargeAmount.args = {
  msg: '10,000',
  error: false,
};

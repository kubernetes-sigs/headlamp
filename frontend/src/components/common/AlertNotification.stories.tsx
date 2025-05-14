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
import { SnackbarProvider } from 'notistack';
import { TestContext } from '../../test';
import { PureAlertNotification, PureAlertNotificationProps } from './AlertNotification';

export default {
  title: 'AlertNotification',
  component: PureAlertNotification,
  argTypes: {
    dispatch: { action: 'dispatch' },
  },
  decorators: [
    Story => (
      <TestContext>
        <SnackbarProvider>
          <Story />
        </SnackbarProvider>
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<PureAlertNotificationProps> = args => <PureAlertNotification {...args} />;

export const Error = Template.bind({});
Error.args = {
  checkerFunction: () => Promise.reject('offline'),
};

export const NoError = Template.bind({});
NoError.args = {
  checkerFunction: () => Promise.resolve({ statusText: 'OK' }),
};

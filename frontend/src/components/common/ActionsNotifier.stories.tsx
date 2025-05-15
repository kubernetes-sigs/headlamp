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
import { MemoryRouter } from 'react-router-dom';
import { PureActionsNotifier, PureActionsNotifierProps } from './ActionsNotifier';

export default {
  title: 'ActionsNotifier',
  component: PureActionsNotifier,
  argTypes: {
    dispatch: { action: 'dispatch' },
  },
  decorators: [
    Story => (
      <MemoryRouter>
        <SnackbarProvider>
          <Story />
        </SnackbarProvider>
      </MemoryRouter>
    ),
  ],
} as Meta;

const Template: StoryFn<PureActionsNotifierProps> = args => <PureActionsNotifier {...args} />;

export const Some = Template.bind({});
Some.args = {
  clusterActions: {
    '1': {
      id: '1',
      url: '/tmp',
      dismissSnackbar: '1',
      message: 'Some message',
      snackbarProps: {},
      buttons: [{ label: 'Meow', actionToDispatch: 'meow' }],
    },
  },
};

export const None = Template.bind({});
None.args = {
  clusterActions: {},
};

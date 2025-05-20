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
import { Meta, StoryFn } from '@storybook/react';
import { TestContext } from '../../test';
import OauthPopup from './OauthPopup';

export default {
  title: 'Oidcauth/OauthPopup',
  component: OauthPopup,
  decorators: [
    Story => {
      return (
        <TestContext>
          <Story />
        </TestContext>
      );
    },
  ],
} as Meta;

const Template: StoryFn<typeof OauthPopup> = args => {
  return <OauthPopup {...args}>Open Auth Popup</OauthPopup>;
};

export const Default = Template.bind({});
Default.args = {
  url: 'https://example.com/auth',
  title: 'Auth Popup',
  button: Button,
  onCode: code => {
    console.log('Received code:', code);
  },
};

export const WithDimensions = Template.bind({});
WithDimensions.args = {
  url: 'https://example.com/auth',
  title: 'Auth Popup',
  height: 1000,
  width: 1000,
  button: Button,
  onCode: code => {
    console.log('Received code:', code);
  },
};

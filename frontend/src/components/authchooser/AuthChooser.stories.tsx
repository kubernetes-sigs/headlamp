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
import { TestContext } from '../../test';
import { PureAuthChooser, PureAuthChooserProps } from './index';

export default {
  title: 'AuthChooser',
  component: PureAuthChooser,
  argTypes: {
    handleOidcAuth: { action: 'oidc code arrived' },
    handleTokenAuth: { action: 'use a token clicked' },
    handleTryAgain: { action: 'try again clicked' },
    handleBackButtonPress: { action: 'back button clicked' },
  },
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

const Template: StoryFn<PureAuthChooserProps> = args => <PureAuthChooser {...args} />;

const argFixture = {
  clusterName: 'some-cluster',
  title: 'some title',
  testingTitle: 'some testing title',
  testingAuth: false,
  error: null,
  oauthUrl: 'http://example.com/',
  clusterAuthType: '',
};

export const BasicAuthChooser = Template.bind({});
BasicAuthChooser.args = {
  ...argFixture,
};

export const Testing = Template.bind({});
Testing.args = {
  ...argFixture,
  testingAuth: true,
};

export const HaveClusters = Template.bind({});
HaveClusters.args = {
  ...argFixture,
};

export const AuthTypeoidc = Template.bind({});
AuthTypeoidc.args = {
  ...argFixture,
  clusterAuthType: 'oidc',
  title: 'Sign in with OpenID Connect',
};

export const AnError = Template.bind({});
AnError.args = {
  ...argFixture,
  error: Error('Oh no! Some error happened?!?'),
};

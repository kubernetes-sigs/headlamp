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
import { TestContext } from '../../../test';
import { MatchExpressions, type MatchExpressionsProps } from './MatchExpressions';

const exampleMatchLabels = {
  env: 'production',
  tier: 'frontend',
};

const exampleMatchExpressions = [
  { key: 'version', operator: 'Equals', values: ['1.0'] },
  { key: 'zone', operator: 'In', values: ['us-east-1', 'us-west-2'] },
  { key: 'beta', operator: 'DoesNotExist', values: [] },
];

export default {
  title: 'Resource/MatchExpressions',
  component: MatchExpressions,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<MatchExpressionsProps> = args => <MatchExpressions {...args} />;

export const Default = Template.bind({});
Default.args = {
  matchLabels: exampleMatchLabels,
};

export const WithExpressions = Template.bind({});
WithExpressions.args = {
  matchLabels: exampleMatchLabels,
  matchExpressions: exampleMatchExpressions,
};

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

import { Typography } from '@mui/material';
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { TestContext } from '../../../test';
import { InfoLabel, InfoLabelProps } from '../Label';

export default {
  title: 'Labels/InfoLabel',
  component: InfoLabel,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
  argTypes: {
    name: { control: 'text', description: 'The name/key part of the label (left side).' },
    value: {
      control: 'text',
      description:
        'The value part of the label (right side). If children are provided, this prop is ignored.',
    },
    children: {
      control: 'object',
      description: 'Custom React node for the value part. Overrides the `value` prop if provided.',
    },
  },
} as Meta<typeof InfoLabel>;

const Template: StoryFn<InfoLabelProps> = args => <InfoLabel {...args} />;

export const WithStringValue = Template.bind({});
WithStringValue.args = {
  name: 'Property Name',
  value: 'Property Value',
};
WithStringValue.storyName = 'With String Value';

export const WithReactNodeValue = Template.bind({});
WithReactNodeValue.args = {
  name: 'Complex Property',
  children: (
    <Typography color="secondary.main">
      This is a <em>custom React node</em> value.
    </Typography>
  ),
};
WithReactNodeValue.storyName = 'With React Node Value';

export const OnlyName = Template.bind({});
OnlyName.args = {
  name: 'Property With No Explicit Value',
};
OnlyName.storyName = 'Only Name (Value Undefined)';

export const LongNameAndValue = Template.bind({});
LongNameAndValue.args = {
  name: 'This is a very long property name to demonstrate how it behaves within the grid layout used by InfoLabel',
  value:
    'This is a correspondingly long property value that should also wrap or be handled appropriately by the layout and typography settings.',
};
LongNameAndValue.storyName = 'With Long Name and Value';

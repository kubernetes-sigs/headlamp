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

import { Box, Typography } from '@mui/material';
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { TestContext } from '../../test';
import LabelListItem, { LabelListItemProps } from './LabelListItem';

export default {
  title: 'LabelListItem',
  component: LabelListItem,
  decorators: [
    Story => (
      <TestContext>
        {/* Provide a wrapper with a fixed width to demonstrate tooltip behavior */}
        <Box sx={{ width: '250px', border: '1px dashed lightgrey', padding: '10px' }}>
          <Story />
        </Box>
      </TestContext>
    ),
  ],
  argTypes: {
    labels: {
      control: 'object',
      description: 'An array of strings or ReactNodes to be displayed as labels.',
    },
  },
} as Meta<typeof LabelListItem>;

const Template: StoryFn<LabelListItemProps> = args => <LabelListItem {...args} />;

export const ShortLabels = Template.bind({});
ShortLabels.args = {
  labels: ['app: my-app', 'env: production', 'tier: frontend'],
};
ShortLabels.storyName = 'Multiple Short Labels';

export const LongLabelsWithTooltip = Template.bind({});
LongLabelsWithTooltip.args = {
  labels: [
    'kubernetes.io/arch=amd64',
    'kubernetes.io/hostname=kind-control-plane-node-that-is-very-long',
    'kubernetes.io/os=linux',
    'node-role.kubernetes.io/control-plane=',
    'another.very.long.label.name.with.a.very.long.value/foo=bar-baz-qux-quux-corge-grault-garply-waldo-fred-plugh-xyzzy-thud-extra-long-value-to-force-wrapping-and-tooltip-behavior',
  ],
};
LongLabelsWithTooltip.storyName = 'Multiple Long Labels (Tooltip)';
LongLabelsWithTooltip.parameters = {
  docs: {
    description: {
      story: 'Hover over the labels to see the full list in a tooltip, each on a new line.',
    },
  },
};

export const SingleLabel = Template.bind({});
SingleLabel.args = {
  labels: ['app: my-single-app'],
};
SingleLabel.storyName = 'Single Label';

export const NoLabels = Template.bind({});
NoLabels.args = {
  labels: [],
};
NoLabels.storyName = 'No Labels (Should Render Null)';

export const UndefinedLabels = Template.bind({});
UndefinedLabels.args = {
  labels: undefined,
};
UndefinedLabels.storyName = 'Undefined Labels (Should Render Null)';

export const WithReactNodeChildren = Template.bind({});
WithReactNodeChildren.args = {
  labels: [
    <Typography key="1" variant="caption" color="primary">
      app: my-app
    </Typography>,
    <strong key="2">env: staging</strong>,
    'tier: backend-service-component',
  ],
};
WithReactNodeChildren.storyName = 'With ReactNode Children';

export const MixedContentInLabels = Template.bind({});
MixedContentInLabels.args = {
  labels: ['simple-string', null, undefined, <b key="bold">Bold Item</b>, 'another-string'],
};
MixedContentInLabels.storyName = 'With Null/Undefined/ReactNode in Array';
MixedContentInLabels.parameters = {
  docs: {
    description: {
      story:
        'The component should gracefully handle null/undefined values within the labels array (they are typically filtered out by `join`).',
    },
  },
};

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
import React from 'react';
import { getTestDate } from '../../../helpers/testHelpers';
import { TestContext } from '../../../test';
import { DateLabel, DateLabelProps } from '../Label';

const now = getTestDate();
const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
const longTimeAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

export default {
  title: 'common/Labels/DateLabel',
  component: DateLabel,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
  argTypes: {
    date: {
      control: 'date',
      description: 'The date to display. Can be a Date object, string, or timestamp number.',
    },
    format: {
      control: 'radio',
      options: ['brief', 'mini'],
      description: 'The format for displaying the time ago.',
    },
    iconProps: {
      control: 'object',
      description: 'Props to pass to the Icon component.',
    },
  },
} as Meta<typeof DateLabel>;

const Template: StoryFn<DateLabelProps> = args => <DateLabel {...args} />;

export const RecentDateBriefFormat = Template.bind({});
RecentDateBriefFormat.args = {
  date: oneHourAgo.toISOString(),
  format: 'brief',
};
RecentDateBriefFormat.storyName = 'Recent Date (Brief Format)';

export const RecentDateMiniFormat = Template.bind({});
RecentDateMiniFormat.args = {
  date: oneHourAgo.toISOString(),
  format: 'mini',
};
RecentDateMiniFormat.storyName = 'Recent Date (Mini Format)';

export const OlderDateBriefFormat = Template.bind({});
OlderDateBriefFormat.args = {
  date: twoDaysAgo.toISOString(),
  format: 'brief',
};
OlderDateBriefFormat.storyName = 'Older Date (Brief Format)';

export const MuchOlderDateMiniFormat = Template.bind({});
MuchOlderDateMiniFormat.args = {
  date: longTimeAgo.getTime(), // Pass as timestamp
  format: 'mini',
};
MuchOlderDateMiniFormat.storyName = 'Much Older Date (Mini Format)';

export const WithCustomIconProps = Template.bind({});
WithCustomIconProps.args = {
  date: now.toISOString(),
  iconProps: {
    color: 'blue',
    width: '1.2rem',
    height: '1.2rem',
  },
};

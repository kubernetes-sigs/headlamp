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

import { Box } from '@mui/material';
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { getTestDate } from '../../../helpers/testHelpers';
import { TestContext } from '../../../test';
import { DateLabel, DateLabelProps } from '../Label';

const baseDate = getTestDate();
const oneHourAgo = new Date(baseDate.getTime() - 60 * 60 * 1000);
const twoDaysAgo = new Date(baseDate.getTime() - 2 * 24 * 60 * 60 * 1000);
const sixtyDaysAgo = new Date(baseDate.getTime() - 60 * 24 * 60 * 60 * 1000);

export default {
  title: 'Labels/DateLabel',
  component: DateLabel,
  decorators: [
    Story => (
      <TestContext>
        <Box sx={{ padding: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Story />
        </Box>
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
      options: ['brief', 'mini', undefined],
      description:
        'The format for displaying the time ago text (e.g., "1 hour ago" vs "1h"). Defaults to brief.',
    },
    iconProps: {
      control: 'object',
      description: 'Props to pass to the calendar Icon component (Iconify).',
    },
  },
} as Meta<typeof DateLabel>;

const Template: StoryFn<DateLabelProps> = args => <DateLabel {...args} />;

export const RecentBrief = Template.bind({});
RecentBrief.args = {
  date: oneHourAgo.toISOString(),
  format: 'brief',
};
RecentBrief.storyName = 'One Hour Ago (Brief)';

export const RecentMini = Template.bind({});
RecentMini.args = {
  date: oneHourAgo.toISOString(),
  format: 'mini',
};
RecentMini.storyName = 'One Hour Ago (Mini)';

export const OlderBrief = Template.bind({});
OlderBrief.args = {
  date: twoDaysAgo.toISOString(),
  format: 'brief',
};
OlderBrief.storyName = 'Two Days Ago (Brief)';

export const MuchOlderMiniTimestamp = Template.bind({});
MuchOlderMiniTimestamp.args = {
  date: sixtyDaysAgo.getTime(),
  format: 'mini',
};
MuchOlderMiniTimestamp.storyName = 'Sixty Days Ago (Mini, Timestamp Input)';

export const WithCustomIconProps = Template.bind({});
WithCustomIconProps.args = {
  date: baseDate.toISOString(),
  iconProps: {
    color: 'green',
    width: '20px',
    height: '20px',
  },
};
WithCustomIconProps.storyName = 'With Custom Icon Props';

export const DefaultFormat = Template.bind({});
DefaultFormat.args = {
  date: oneHourAgo.toISOString(),
};
DefaultFormat.storyName = 'Default Format (Should be Brief)';

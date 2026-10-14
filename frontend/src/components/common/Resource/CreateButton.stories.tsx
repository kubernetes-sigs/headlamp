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
import { screen } from '@testing-library/react';
import React, { useEffect } from 'react';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { TestContext } from '../../../test';
import { ActivitiesRenderer, Activity } from '../../activity/Activity';
import CreateButton from './CreateButton';

function CreateActivityLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    return () => {
      Activity.close('create-button');
    };
  }, []);

  return (
    <Box
      sx={{
        display: 'grid',
        overflow: 'hidden',
        position: 'relative',
        gridTemplateRows: '1fr min-content',
        gridTemplateColumns: 'min-content 1fr',
        width: '100%',
        height: '90vh',
      }}
    >
      <Box
        id="main"
        sx={{
          overflow: 'auto',
          position: 'relative',
          minHeight: '0',
          gridColumn: '2/3',
          gridRow: '1/2',
          padding: 2,
        }}
      >
        {children}
      </Box>
      <ActivitiesRenderer />
    </Box>
  );
}

export default {
  title: 'Resource/CreateButton',
  component: CreateButton,
  argTypes: {},
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<typeof CreateButton> = args => <CreateButton {...args} />;

export const Default = Template.bind({});
Default.args = {
  isNarrow: false,
};

export const NarrowButton = Template.bind({});
NarrowButton.args = {
  isNarrow: true,
};

/**
 * Clicking Create launches the full-page create/apply activity, including the
 * resource type picker.
 */
export const OpensCreateActivity = Template.bind({});
OpensCreateActivity.args = {
  isNarrow: false,
};
OpensCreateActivity.decorators = [
  Story => (
    <CreateActivityLayout>
      <Story />
    </CreateActivityLayout>
  ),
];
OpensCreateActivity.parameters = {
  storyshots: { disable: true },
};
OpensCreateActivity.play = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  await waitFor(() => expect(screen.getByLabelText('Resource Type')).toBeVisible());
};

/**
 * The compact sidebar control uses an icon button with the Create / Apply
 * description, and still opens the same activity.
 */
export const NarrowButtonOpensCreateActivity = Template.bind({});
NarrowButtonOpensCreateActivity.args = {
  isNarrow: true,
};
NarrowButtonOpensCreateActivity.decorators = [
  Story => (
    <CreateActivityLayout>
      <Story />
    </CreateActivityLayout>
  ),
];
NarrowButtonOpensCreateActivity.parameters = {
  storyshots: { disable: true },
};
NarrowButtonOpensCreateActivity.play = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Create / Apply' }));
  await waitFor(() => expect(screen.getByLabelText('Resource Type')).toBeVisible());
};

/**
 * Callers can pass onClickExtra to run extra work (for example closing a menu)
 * when Create is clicked.
 */
export const ExtraClickHandler = Template.bind({});
ExtraClickHandler.args = {
  isNarrow: false,
  onClickExtra: fn(),
};
ExtraClickHandler.decorators = [
  Story => (
    <CreateActivityLayout>
      <Story />
    </CreateActivityLayout>
  ),
];
ExtraClickHandler.parameters = {
  storyshots: { disable: true },
};
ExtraClickHandler.play = async ({ args }) => {
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  await waitFor(() => expect(args.onClickExtra).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByLabelText('Resource Type')).toBeVisible());
};

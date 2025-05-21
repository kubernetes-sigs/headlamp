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
import { TestContext } from '../../test'; // Adjust path if necessary
import EmptyContent from './EmptyContent'; // Assuming EmptyContentProps is exported if needed, or define locally

// Define props if not directly exported from EmptyContent.tsx
// For EmptyContent, it's simple enough that we might not need explicit props interface here.
// type EmptyContentProps = React.ComponentProps<typeof EmptyContent>;

export default {
  title: 'common/EmptyContent', // How it will appear in the Storybook hierarchy
  component: EmptyContent,
  decorators: [
    // Optional: Wrap with TestContext if your component or its children might need it
    // For EmptyContent, it's probably not strictly necessary but good practice for consistency.
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
  argTypes: {
    color: {
      control: 'select',
      options: [
        'textPrimary',
        'textSecondary',
        'primary',
        'secondary',
        'error',
        'warning',
        'info',
        'success',
      ],
      description: 'The color of the text, using theme palette options.',
    },
    children: {
      control: 'text',
      description: 'The content to display inside the Empty component.',
    },
  },
} as Meta<typeof EmptyContent>;

const Template: StoryFn<typeof EmptyContent> = args => <EmptyContent {...args} />;

export const DefaultMessage = Template.bind({});
DefaultMessage.args = {
  children: 'No items to display.',
};
DefaultMessage.storyName = 'Default Message (string child)';

export const CustomColor = Template.bind({});
CustomColor.args = {
  children: 'This message has a custom color.',
  color: 'primary.main', // Example of using theme palette path
};
CustomColor.storyName = 'Custom Text Color';

export const ErrorColor = Template.bind({});
ErrorColor.args = {
  children: 'An error occurred, nothing to show!',
  color: 'error.main',
};
ErrorColor.storyName = 'Error Message Color';

export const WithReactNodeChild = Template.bind({});
WithReactNodeChild.args = {
  children: (
    <>
      <Typography variant="h6">No Data Available</Typography>
      <Typography variant="body2">Please try adjusting your filters or come back later.</Typography>
    </>
  ),
};
WithReactNodeChild.storyName = 'With React Node Child';

export const EmptyChildren = Template.bind({});
EmptyChildren.args = {
  children: '', // Or simply omit children, as it will render nothing
};
EmptyChildren.storyName = 'Empty Children (renders nothing)';

export const MultipleStringChildren = Template.bind({});
MultipleStringChildren.args = {
  children: (
    <>
      First line of message.
      <br />
      Second line of message.
    </>
  ),
};
MultipleStringChildren.storyName = 'Multiple String Children';

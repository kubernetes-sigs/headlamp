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
import Typography from '@mui/material/Typography';
import { Meta, StoryFn } from '@storybook/react';
import React, { useState } from 'react';
import { TestContext } from '../../test'; // Adjust path if necessary
import { ConfirmDialog, ConfirmDialogProps } from './ConfirmDialog'; // Assuming ConfirmDialogProps is exported

export default {
  title: 'common/ConfirmDialog', // Updated title to match the 'common' category
  component: ConfirmDialog,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
  argTypes: {
    open: {
      control: 'boolean',
      description: 'If true, the Dialog is open.',
    },
    title: {
      control: 'text',
      description: 'The title of the dialog.',
    },
    description: {
      control: 'text', // Can be text for simple cases, or use a custom control for ReactNode
      description: 'The main content/description of the dialog.',
    },
    cancelLabel: {
      control: 'text',
      description: 'Custom label for the cancel button.',
    },
    confirmLabel: {
      control: 'text',
      description: 'Custom label for the confirm button.',
    },
    onConfirm: {
      action: 'confirmed',
      description: 'Callback fired when the confirm button is clicked.',
    },
    handleClose: {
      action: 'closed',
      description:
        'Callback fired when the dialog requests to be closed (e.g., cancel, backdrop click, escape key).',
    },
    // Add other MuiDialogProps as needed, e.g., maxWidth, fullWidth
  },
} as Meta<typeof ConfirmDialog>;

// Template for stories that need to manage the open state
const InteractiveTemplate: StoryFn<ConfirmDialogProps> = args => {
  const [open, setOpen] = useState(args.open || false); // Control open state locally for interaction

  const handleOpenDialog = () => setOpen(true);
  const handleCloseDialog = () => {
    args.handleClose(); // Call the action from Storybook
    setOpen(false);
  };
  const handleConfirmDialog = () => {
    args.onConfirm(); // Call the action from Storybook
    setOpen(false);
  };

  return (
    <>
      <Button variant="outlined" onClick={handleOpenDialog}>
        Open Confirm Dialog
      </Button>
      <ConfirmDialog
        {...args}
        open={open}
        handleClose={handleCloseDialog}
        onConfirm={handleConfirmDialog}
      />
    </>
  );
};

export const DefaultOpen = InteractiveTemplate.bind({});
DefaultOpen.args = {
  open: true, // Will be initially open due to Storybook args, but InteractiveTemplate controls it
  title: 'Confirm Action',
  description: 'Are you sure you want to perform this action? This cannot be undone.',
};
DefaultOpen.storyName = 'Default (Initially Open)';

export const Interactive = InteractiveTemplate.bind({});
Interactive.args = {
  // 'open' prop is controlled by the InteractiveTemplate's local state via the button
  title: 'Delete Item',
  description: 'Are you sure you want to delete "My Important File"? This action is permanent.',
};
Interactive.storyName = 'Interactive (Click Button to Open)';

export const WithCustomButtonLabels = InteractiveTemplate.bind({});
WithCustomButtonLabels.args = {
  title: 'Proceed with Caution',
  description: 'This operation has significant consequences. Do you wish to proceed?',
  confirmLabel: 'Yes, Proceed',
  cancelLabel: 'No, Go Back',
};
WithCustomButtonLabels.storyName = 'Custom Button Labels';

export const WithReactNodeDescription = InteractiveTemplate.bind({});
WithReactNodeDescription.args = {
  title: 'Complex Confirmation',
  description: (
    <>
      <Typography variant="body1" gutterBottom>
        You are about to trigger a series of events:
      </Typography>
      <ul>
        <li>Event A will happen.</li>
        <li>Event B will follow.</li>
        <li>Event C will conclude the process.</li>
      </ul>
      <Typography variant="body2" color="textSecondary">
        Please ensure you understand the implications.
      </Typography>
    </>
  ),
};
WithReactNodeDescription.storyName = 'With ReactNode as Description';

// Story to show how it behaves when the 'open' prop is false initially via args
// (though InteractiveTemplate will make it controllable via button)
export const InitiallyClosed = InteractiveTemplate.bind({});
InitiallyClosed.args = {
  open: false,
  title: 'This Dialog is Closed',
  description: 'You need to click the button to open this dialog.',
};
InitiallyClosed.storyName = 'Initially Closed (Interactive)';

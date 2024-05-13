import DialogContent from '@mui/material/DialogContent';
import Typography from '@mui/material/Typography';
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { Dialog as DialogComponent, DialogProps } from './Dialog';

export default {
  title: 'Dialog',
  component: DialogComponent,
} as Meta;

const Template: StoryFn<DialogProps> = args => (
  <DialogComponent {...args}>
    <DialogContent>
      <Typography>Some content here</Typography>
    </DialogContent>
  </DialogComponent>
);

export const Dialog = Template.bind({});
Dialog.args = {
  open: true,
  title: 'A fine title',
};

export const DialogWithCloseButton = Template.bind({});
DialogWithCloseButton.args = {
  open: true,
  title: 'A fine title',
};

export const DialogWithFullScreenButton = Template.bind({});
DialogWithFullScreenButton.args = {
  open: true,
  title: 'A fine title',
  withFullScreen: true,
};

export const DialogAlreadyInFullScreen = Template.bind({});
DialogAlreadyInFullScreen.args = {
  open: true,
  title: 'A fine title',
  withFullScreen: true,
  fullScreen: true,
};

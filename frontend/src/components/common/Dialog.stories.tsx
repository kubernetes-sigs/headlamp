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

import { DialogContent, Typography } from '@mui/material';
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

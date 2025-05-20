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
import { ConfirmDialog as ConfirmDialogComponent, ConfirmDialogProps } from './Dialog';

export default {
  title: 'ConfirmDialog',
  component: ConfirmDialogComponent,
  argTypes: {
    onConfirm: { action: 'confirm clicked' },
    handleClose: { action: 'closed' },
  },
} as Meta;

const Template: StoryFn<ConfirmDialogProps> = args => <ConfirmDialogComponent {...args} />;

export const ConfirmDialog = Template.bind({});
ConfirmDialog.args = {
  open: true,
  title: 'A fine title',
  description: 'A really good description.',
};

export const ConfirmDialogClosed = Template.bind({});
ConfirmDialogClosed.args = {
  open: false,
  title: 'A fine title',
  description: 'A really good description.',
};

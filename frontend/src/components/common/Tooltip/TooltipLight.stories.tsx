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

import { Icon } from '@iconify/react';
import IconButton from '@mui/material/IconButton';
import { Meta, StoryFn } from '@storybook/react';
import i18next from 'i18next';
import TooltipLight, { TooltipLightProps } from './TooltipLight';

export default {
  title: 'Tooltip/TooltipLight',
  component: TooltipLight,
} as Meta;

const Template: StoryFn<TooltipLightProps> = args => <TooltipLight {...args} />;

export const Add = Template.bind({});
Add.args = {
  title: 'Add',
  children: (
    <IconButton aria-label={i18next.t('translation|Add')}>
      <Icon color="#adadad" icon="mdi:plus-circle" width="48" />
    </IconButton>
  ),
};

export const Interactive = Template.bind({});
Interactive.args = {
  title: 'Add',
  interactive: true,
  children: (
    <IconButton aria-label={i18next.t('translation|Add')}>
      <Icon color="#adadad" icon="mdi:plus-circle" width="48" />
    </IconButton>
  ),
};

export const NotInteractive = Template.bind({});
NotInteractive.args = {
  title: 'Add',
  interactive: false,
  children: (
    <IconButton aria-label={i18next.t('translation|Add')}>
      <Icon color="#adadad" icon="mdi:plus-circle" width="48" />
    </IconButton>
  ),
};

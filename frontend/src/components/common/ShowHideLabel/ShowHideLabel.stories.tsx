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
import ShowHideLabel, { ShowHideLabelProps } from './ShowHideLabel';

export default {
  title: 'common/ShowHideLabel',
  component: ShowHideLabel,
  argTypes: {},
} as Meta;

const Template: StoryFn<ShowHideLabelProps> = args => (
  <Box width={300}>
    <ShowHideLabel {...args} />
  </Box>
);

export const Basic = Template.bind({});
Basic.args = {
  children:
    'This is a placeholder label text that is many characters long. It is meant to be used as a temporary label for a UI element until the actual label is available. The text is long enough to fill up the space allocated for the label and provide a realistic preview of how the label will look in the final UI. You can replace this text with the actual label text once it is available. This will ensure that the UI looks complete and professional even during the development phase. Thank you for using this placeholder text!',
  labelId: 'label-id',
};

export const Expanded = Template.bind({});
Expanded.args = {
  children:
    'This is a placeholder label text that is many characters long. It is meant to be used as a temporary label for a UI element until the actual label is available. The text is long enough to fill up the space allocated for the label and provide a realistic preview of how the label will look in the final UI. You can replace this text with the actual label text once it is available. This will ensure that the UI looks complete and professional even during the development phase. Thank you for using this placeholder text!',
  show: true,
  labelId: 'my-label',
};

export const Empty = Template.bind({});
Empty.args = {
  children: '',
  labelId: 'my-label1',
};

export const ShortText = Template.bind({});
ShortText.args = {
  children: 'Short text',
  labelId: 'my-label2',
};

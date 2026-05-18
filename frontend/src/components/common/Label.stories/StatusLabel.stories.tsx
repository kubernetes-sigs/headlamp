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
import { StatusLabel as StatusLabelComponent, StatusLabelProps } from '../Label';

export default {
  title: 'Label/StatusLabel',
  component: StatusLabelComponent,
  argTypes: {},
} as Meta;

const Template: StoryFn<StatusLabelProps> = args => (
  <StatusLabelComponent {...args}>{args.status}</StatusLabelComponent>
);

export const Success = Template.bind({
  component: StatusLabelComponent,
});
Success.args = {
  status: 'success',
};

export const Error = Template.bind({
  component: StatusLabelComponent,
});
Error.args = {
  status: 'error',
};

export const Warning = Template.bind({
  component: StatusLabelComponent,
});
Warning.args = {
  status: 'warning',
};

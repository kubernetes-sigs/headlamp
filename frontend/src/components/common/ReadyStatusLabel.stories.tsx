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
import { ReadyStatusLabel, ReadyStatusLabelProps } from './ReadyStatusLabel';

export default {
  title: 'ReadyStatusLabel',
  component: ReadyStatusLabel,
} as Meta;

const Template: StoryFn<ReadyStatusLabelProps> = args => <ReadyStatusLabel {...args} />;

export const True = Template.bind({});
True.args = {
  status: 'True',
};

export const False = Template.bind({});
False.args = {
  status: 'False',
};

export const Unknown = Template.bind({});
Unknown.args = {
  status: 'Unknown',
};

export const Warning = Template.bind({});
Warning.args = {
  status: 'Suspended',
};

export const WithTooltip = Template.bind({});
WithTooltip.args = {
  status: 'False',
  reason: 'CrashLoopBackOff',
  message: 'Back-off restarting failed container',
};

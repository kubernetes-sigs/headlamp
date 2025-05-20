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
import SectionHeader, { SectionHeaderProps } from './SectionHeader';

export default {
  title: 'SectionHeader',
  component: SectionHeader,
  argTypes: { onTabChanged: { action: 'tab changed' } },
} as Meta;

const Template: StoryFn<SectionHeaderProps> = args => <SectionHeader {...args} />;

export const Main = Template.bind({});
Main.args = {
  title: 'This is a section title main',
  headerStyle: 'main',
};

export const Subsection = Template.bind({});
Subsection.args = {
  title: 'This is a section title subsection',
  headerStyle: 'subsection',
};

export const Normal = Template.bind({});
Normal.args = {
  title: 'This is a section title normal',
  headerStyle: 'normal',
};

export const NormalNoPadding = Template.bind({});
NormalNoPadding.args = {
  title: 'No padding on this normal title',
  headerStyle: 'normal',
  noPadding: true,
};

export const Actions = Template.bind({});
Actions.args = {
  title: 'This one has actions',
  headerStyle: 'normal',
  actions: [<button>Edit</button>, <button>Delete</button>],
};

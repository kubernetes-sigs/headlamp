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
import SectionBox, { SectionBoxProps } from './SectionBox';

export default {
  title: 'SectionBox',
  component: SectionBox,
  argTypes: { onTabChanged: { action: 'tab changed' } },
} as Meta;

const Template: StoryFn<SectionBoxProps> = args => <SectionBox {...args} />;

export const WithChildren = Template.bind({});
WithChildren.args = {
  children: <p>A child paragraph.</p>,
};

export const Titled = Template.bind({});
Titled.args = {
  title: 'This is a section title default',
};

export const HeaderProps = Template.bind({});
HeaderProps.args = {
  title: 'This is a section title with a main style',
  headerProps: {
    headerStyle: 'main',
  },
};

export const TitledChildren = Template.bind({});
TitledChildren.args = {
  title: 'This is a section title',
  children: <p>A child paragraph.</p>,
};

export const CustomTitle = Template.bind({});
CustomTitle.args = {
  title: <h1>custom title</h1>,
};

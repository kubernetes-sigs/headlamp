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
import Loader, { LoaderProps } from './Loader';

export default {
  title: 'Loader',
  component: Loader,
} as Meta;

const Template: StoryFn<LoaderProps> = args => <Loader {...args} />;

export const WithContainer = Template.bind({});
WithContainer.args = {
  title: 'Loading with a container',
};

export const WithoutContainer = Template.bind({});
WithoutContainer.args = {
  noContainer: true,
  title: 'Loading without a container',
};

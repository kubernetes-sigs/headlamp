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
import Pod from '../../lib/k8s/pod';
import { TestContext } from '../../test';
import PodResourceClaimsSection from './PodResourceClaimsSection';
import { podList, podWithResourceClaims } from './storyHelper';

export default {
  title: 'Pod/ResourceClaimsSection',
  component: PodResourceClaimsSection,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<{ pod: Pod }> = args => <PodResourceClaimsSection {...args} />;

export const EveryKindOfClaim = Template.bind({});
EveryKindOfClaim.args = { pod: new Pod(podWithResourceClaims, 'gpu-cluster') };

export const NoClaims = Template.bind({});
NoClaims.args = { pod: new Pod(podList[0]) };

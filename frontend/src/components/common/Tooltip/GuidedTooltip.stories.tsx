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

import { configureStore } from '@reduxjs/toolkit';
import { Meta, StoryFn } from '@storybook/react';
import configReducer, { initialState } from '../../../redux/configSlice';
import { TestContext } from '../../../test';
import GuidedTooltip, { GuidedTooltipProps } from './GuidedTooltip';

function makeStore(tutorialTooltips: boolean) {
  return configureStore({
    reducer: { config: configReducer },
    preloadedState: {
      config: { ...initialState, settings: { ...initialState.settings, tutorialTooltips } },
    },
  });
}

export default {
  title: 'Tooltip/GuidedTooltip',
  component: GuidedTooltip,
} as Meta;

const Template: StoryFn<GuidedTooltipProps & { tutorialTooltips: boolean }> = ({
  tutorialTooltips,
  ...args
}) => (
  <TestContext store={makeStore(tutorialTooltips)}>
    Load from KubeConfig
    <GuidedTooltip {...args} />
  </TestContext>
);

export const WithRecommendation = Template.bind({});
WithRecommendation.args = {
  tutorialTooltips: true,
  label: 'About loading from KubeConfig',
  description: 'Load an existing kubeconfig file to add the clusters it defines to Headlamp.',
  recommendation: 'If you are using a managed cloud cluster, use this option.',
};

export const DescriptionOnly = Template.bind({});
DescriptionOnly.args = {
  tutorialTooltips: true,
  label: 'About loading from KubeConfig',
  description: 'Load an existing kubeconfig file to add the clusters it defines to Headlamp.',
};

export const Disabled = Template.bind({});
Disabled.args = {
  ...WithRecommendation.args,
  tutorialTooltips: false,
};

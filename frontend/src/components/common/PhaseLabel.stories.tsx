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
import { PhaseLabel, PhaseLabelProps } from './PhaseLabel';

export default {
  title: 'PhaseLabel',
  component: PhaseLabel,
} as Meta;

const Template: StoryFn<PhaseLabelProps> = args => <PhaseLabel {...args} />;

// phase === successPhase (default 'Active')
export const Success = Template.bind({});
Success.args = {
  phase: 'Active',
};

// phase in warningPhases
export const Warning = Template.bind({});
Warning.args = {
  phase: 'Available',
  successPhase: 'Bound',
  warningPhases: ['Available'],
};

// phase matching neither successPhase nor warningPhases
export const Error = Template.bind({});
Error.args = {
  phase: 'Terminating',
};

// empty/undefined/null phase all render nothing
export const Empty = Template.bind({});
Empty.args = {
  phase: '',
};

export const EmptyUndefined = Template.bind({});
EmptyUndefined.args = {
  phase: undefined,
};

export const EmptyNull = Template.bind({});
EmptyNull.args = {
  phase: null,
};

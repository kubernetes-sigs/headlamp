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
import { KubeCondition } from '../../lib/k8s/cluster';
import { TestContext } from '../../test';
import { ConditionList, ConditionListProps } from './ConditionList';

export default {
  title: 'ConditionList',
  component: ConditionList,
} as Meta;

// Transition/update times are intentionally omitted: ConditionList renders them via DateLabel
// (absolute, timezone-dependent), so including them would make the snapshots differ between a
// local run and CI. lastProbeTime is required by the type but never rendered.
const CONDITIONS: KubeCondition[] = [
  {
    type: 'Ready',
    status: 'True',
    lastProbeTime: null,
    reason: 'PodReady',
    message: 'Pod is ready',
  },
  {
    type: 'PodScheduled',
    status: 'False',
    lastProbeTime: null,
    reason: 'Unschedulable',
    message: 'No nodes available',
  },
  {
    type: 'Initialized',
    status: 'Unknown',
    lastProbeTime: null,
  },
];

const Template: StoryFn<ConditionListProps> = args => (
  <TestContext>
    <ConditionList {...args} />
  </TestContext>
);

// True -> success, False -> error, anything else -> neutral chip
export const Default = Template.bind({});
Default.args = {
  conditions: CONDITIONS,
};

// showLastUpdate adds the extra Last Update column
export const WithLastUpdate = Template.bind({});
WithLastUpdate.args = {
  conditions: CONDITIONS,
  showLastUpdate: true,
};

// empty/undefined/null conditions all render nothing
export const Empty = Template.bind({});
Empty.args = {
  conditions: [],
};

export const EmptyUndefined = Template.bind({});
EmptyUndefined.args = {
  conditions: undefined,
};

export const EmptyNull = Template.bind({});
EmptyNull.args = {
  conditions: null,
};

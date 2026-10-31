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
import { useState } from 'react';
import { ClusterLabels } from '../../../helpers/clusterLabels';
import { TestContext } from '../../../test';
import ClusterLabelsDialog, { ClusterLabelsEditor } from './ClusterLabelsEditor';

export default {
  title: 'Settings/ClusterLabelsEditor',
  component: ClusterLabelsEditor,
} as Meta;

const EditorTemplate: StoryFn<{ initialLabels: ClusterLabels }> = ({ initialLabels }) => {
  const [labels, setLabels] = useState(initialLabels);
  return (
    <TestContext>
      <ClusterLabelsEditor value={labels} onChange={setLabels} />
    </TestContext>
  );
};

export const Empty = EditorTemplate.bind({});
Empty.args = { initialLabels: {} };

export const WithLabels = EditorTemplate.bind({});
WithLabels.args = { initialLabels: { environment: 'production', 'example.com/team': 'platform' } };

// Labels that are not valid Kubernetes label syntax are reported and can't be saved.
export const WithInvalidLabels = EditorTemplate.bind({});
WithInvalidLabels.args = { initialLabels: { environment: 'production', 'bad key': '-nope' } };

export const Dialog: StoryFn = () => (
  <TestContext>
    <ClusterLabelsDialog open cluster="my-cluster" onClose={() => {}} />
  </TestContext>
);

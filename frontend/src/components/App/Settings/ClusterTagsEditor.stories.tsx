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
import { ClusterTags } from '../../../helpers/clusterTags';
import { TestContext } from '../../../test';
import ClusterTagsDialog, { ClusterTagsEditor } from './ClusterTagsEditor';

export default {
  title: 'Settings/ClusterTagsEditor',
  component: ClusterTagsEditor,
} as Meta;

const EditorTemplate: StoryFn<{ initialTags: ClusterTags }> = ({ initialTags }) => {
  const [tags, setTags] = useState(initialTags);
  return (
    <TestContext>
      <ClusterTagsEditor value={tags} onChange={setTags} />
    </TestContext>
  );
};

export const Empty = EditorTemplate.bind({});
Empty.args = { initialTags: {} };

export const WithTags = EditorTemplate.bind({});
WithTags.args = { initialTags: { environment: 'production', 'example.com/team': 'platform' } };

// Tags that are not valid tag syntax are reported and can't be saved.
export const WithInvalidTags = EditorTemplate.bind({});
WithInvalidTags.args = { initialTags: { environment: 'production', 'bad key': '-nope' } };

export const Dialog: StoryFn = () => (
  <TestContext>
    <ClusterTagsDialog open cluster="my-cluster" onClose={() => {}} />
  </TestContext>
);

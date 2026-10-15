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
import { KubeObject } from '../../lib/k8s/KubeObject';
import { categoriesConfig } from '../../lib/k8s/ResourceCategory';
import { KubeObjectStatus } from '../resourceMap/nodes/KubeObjectStatus';
import { ResourceCategoriesList } from './ResourceCategoriesList';

export default {
  title: 'project/ResourceCategoriesList',
  component: ResourceCategoriesList,
} as Meta;

const [workloads, storage, network] = categoriesConfig;

/** The list only reads items.length, so the items themselves can be empty. */
function makeItems(count: number) {
  return Array.from({ length: count }, () => ({} as KubeObject));
}

function makeHealth(health: Partial<Record<KubeObjectStatus, number>>) {
  return { success: 0, warning: 0, error: 0, ...health };
}

function makeCategory(
  category: (typeof categoriesConfig)[number],
  health: Partial<Record<KubeObjectStatus, number>>
) {
  const counts = makeHealth(health);
  return {
    category,
    items: makeItems(counts.success + counts.warning + counts.error),
    health: counts,
  };
}

const Template: StoryFn<typeof ResourceCategoriesList> = args => (
  <ResourceCategoriesList {...args} />
);

export const Default = Template.bind({});
Default.args = {
  categoryList: [
    makeCategory(workloads, { success: 8 }),
    makeCategory(storage, { success: 3 }),
    makeCategory(network, { success: 2 }),
  ],
  onCategoryClick: () => {},
};

export const WithWarnings = Template.bind({});
WithWarnings.args = {
  categoryList: [
    makeCategory(workloads, { success: 5, warning: 2 }),
    makeCategory(storage, { success: 3 }),
  ],
  onCategoryClick: () => {},
};

export const WithErrors = Template.bind({});
WithErrors.args = {
  categoryList: [
    makeCategory(workloads, { success: 4, warning: 1, error: 2 }),
    makeCategory(storage, { success: 3 }),
  ],
  onCategoryClick: () => {},
};

export const EmptyCategory = Template.bind({});
EmptyCategory.args = {
  categoryList: [makeCategory(workloads, { success: 4 }), makeCategory(storage, {})],
  onCategoryClick: () => {},
};

export const SelectedCategory = Template.bind({});
SelectedCategory.args = {
  categoryList: [
    makeCategory(workloads, { success: 8 }),
    makeCategory(storage, { success: 3 }),
    makeCategory(network, { success: 2 }),
  ],
  selectedCategoryName: storage.label,
  onCategoryClick: () => {},
};

export const Empty = Template.bind({});
Empty.args = {
  categoryList: [],
  onCategoryClick: () => {},
};

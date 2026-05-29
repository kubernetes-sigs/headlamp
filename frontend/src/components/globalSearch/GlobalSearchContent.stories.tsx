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

import type { Meta, StoryObj } from '@storybook/react';
import { lazy, Suspense } from 'react';
import type { KubeObject } from '../../lib/k8s/KubeObject';
import Pod from '../../lib/k8s/pod';
import { TestContext } from '../../test';
import { generateK8sResourceList } from '../../test/mocker';
import { podList } from '../pod/storyHelper';
import { GlobalSearchContent, type SearchResultItem } from './GlobalSearchContent';

const LazyKubeIcon = lazy(() =>
  import('../resourceMap/kubeIcon/KubeIcon').then(it => ({ default: it.KubeIcon }))
);

const phonyPods = generateK8sResourceList(
  {
    ...podList[5],
    metadata: {
      ...podList[5].metadata,
      name: 'pod-{{i}}',
    },
  },
  { instantiateAs: Pod }
);

function makeSearchResult(item: KubeObject): SearchResultItem {
  return {
    id: item.metadata.uid,
    label: item.metadata.name,
    subLabel: item.kind,
    k8sLabels: item.metadata.labels
      ? Object.entries(item.metadata.labels).map(([key, value]) => key + '=' + value)
      : [],
    icon: (
      <Suspense fallback={null}>
        <LazyKubeIcon kind={item.kind} width="24px" height="24px" />
      </Suspense>
    ),
    onClick: () => {},
  };
}

const meta: Meta<typeof GlobalSearchContent> = {
  title: 'GlobalSearch/GlobalSearchContent',
  component: GlobalSearchContent,
  args: {
    defaultValue: '',
    maxWidth: 500,
    onBlur: () => {},
  },
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof GlobalSearchContent>;

export const WithEmptyInput: Story = {
  args: {
    defaultValue: '',
  },
};

export const LoadingResources: Story = {
  args: {
    defaultValue: 'pod',
    providedSearchResults: {
      isLoadingResources: true,
      items: [],
    },
  },
};

export const FoundSomeResults: Story = {
  args: {
    defaultValue: 'pod',
    providedSearchResults: {
      isLoadingResources: false,
      items: phonyPods.map(makeSearchResult),
    },
  },
};

export const FoundNoResults: Story = {
  args: {
    defaultValue: 'pod',
    providedSearchResults: {
      isLoadingResources: false,
      items: [],
    },
  },
};

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

import { ComponentProps, ReactElement } from 'react';

vi.mock('@iconify/react', () => ({ Icon: () => null }));
vi.mock('../../lib/k8s/cluster', () => ({ KubeObject: class KubeObject {} }));
vi.mock('../../lib/k8s/deployment', () => ({ default: class Deployment {} }));
vi.mock('../../lib/k8s/pod', () => ({ default: class Pod {} }));
vi.mock('../../lib/k8s/replicaSet', () => ({ default: class ReplicaSet {} }));
vi.mock('../../lib/k8s/service', () => ({ default: class Service {} }));
vi.mock('../../test', () => ({
  API_BASE: 'http://localhost',
  TestContext: ({ children }: { children: ReactElement }) => children,
}));
vi.mock('../pod/storyHelper', () => ({ podList: [{ metadata: {} }] }));
vi.mock('./GraphView', () => ({ GraphView: () => null }));

test('BasicExample disables default relation discovery', async () => {
  const { GraphView } = await import('./GraphView');
  const { BasicExample } = await import('./GraphView.stories');
  const story = BasicExample() as ReactElement<{
    children: ReactElement<ComponentProps<typeof GraphView>>;
  }>;
  const graphView = story.props.children;

  expect(graphView.type).toBe(GraphView);
  expect(graphView.props.defaultRelations).toEqual([]);
});

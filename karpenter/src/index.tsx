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
import { registerRoute, registerSidebarEntry } from '@kinvolk/headlamp-plugin/lib';
import { NodeClassDetailView } from './NodeClass/Details';
import { NodeClasses } from './NodeClass/List';

registerSidebarEntry({
  parent: null,
  name: 'karpenter.k8s',
  label: 'Karpenter',
  url: '/karpenter/nodeclass',
});

registerSidebarEntry({
  parent: 'karpenter.k8s',
  name: 'nodeclass',
  label: 'Node Class',
  url: '/karpenter/nodeclass',
});

registerRoute({
  path: '/karpenter/nodeclass',
  sidebar: 'nodeclass',
  component: () => <NodeClasses />,
  name: 'nodeClass',
});

registerRoute({
  path: '/karpenter/:namespace/nodeclass/:name',
  name: 'karpenter',
  sidebar: 'nodeclass',
  component: () => <NodeClassDetailView />,
});

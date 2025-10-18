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

// notes:
// map each ui "context" (specific element) to the topic it belongs to.
// only contexts mapped to the currently-active topic will highlight.
// this keeps clusters.addCluster from lighting up resource stuff.

import type { StrictRecord, TutorialContextId, TutorialTopicId } from './types';

export const contextToTopic: StrictRecord<TutorialContextId, TutorialTopicId> = {
  // clusters → add cluster
  AddClusterButton: 'clusters.addCluster',
  LoadFromKubeConfig: 'clusters.addCluster',
  LoadDemoKubeConfig: 'clusters.addCluster',

  // resources → add resource
  CreateButton: 'resources.addResource',
  CreateDemoResource: 'resources.addResource',
};

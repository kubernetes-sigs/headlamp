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
// this is the shared types file for the tutorial system.
// keep topic ids and context ids centralized so content/maps/components don't drift.
// add new topics/contexts here first, then reference elsewhere.

export type TutorialTopicId =
  | 'clusters.addCluster'
  | 'clusters.deleteCluster'
  | 'resources.addResource';

export type TutorialContextId =
  | 'AddClusterButton'
  | 'LoadFromKubeConfig'
  | 'LoadDemoKubeConfig'
  | 'CreateButton';

// helper to keep record types strict (so we don't miss keys)
export type StrictRecord<K extends string, V> = { [P in K]: V };

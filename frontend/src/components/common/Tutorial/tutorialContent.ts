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
// all tooltip text lives here for now. easy to edit for now
// later we can move this to i18n if needed without touching components.

import type { StrictRecord, TutorialContextId } from './types';

export const tutorialContent: StrictRecord<TutorialContextId, string> = {
  AddClusterButton:
    'This is the Add Cluster button. Click here to add a new Kubernetes cluster to Headlamp.',
  LoadFromKubeConfig:
    'Click here to load a cluster using your KubeConfig file. Make sure you have access to the cluster you want to add.',
  LoadDemoKubeConfig:
    'Click here to load a demo KubeConfig file. This is useful for testing and learning purposes.',
  CreateButton:
    'This is the Create button. Click here to create a new resource in your selected cluster.',
};

export function getTutorialText(context: TutorialContextId): string {
  // simple safe getter. returns empty string if missing (shouldn't happen if types are right)
  return tutorialContent[context] ?? '';
}

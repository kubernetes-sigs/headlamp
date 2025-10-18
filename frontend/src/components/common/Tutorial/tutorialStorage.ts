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

// creating the headlamp.tutorial.active here because I want to be able to add progress tracking later
// thinking I may do this with 'headlamp.tutorial.progress'

// notes:
// single localstorage key that stores which tutorial topic is active right now.
// using a storage event so open views/components react immediately without reload.

import type { TutorialTopicId } from './types';

export const TUTORIAL_ACTIVE_KEY = 'headlamp.tutorial.active';

export interface ActiveTutorialState {
  topicId: TutorialTopicId | null;
}

export function getActiveTutorial(): ActiveTutorialState {
  try {
    const raw = localStorage.getItem(TUTORIAL_ACTIVE_KEY);
    return raw ? JSON.parse(raw) : { topicId: null };
  } catch {
    // if something goes weird with parsing, just say "no active topic"
    return { topicId: null };
  }
}

export function setActiveTutorial(topicId: ActiveTutorialState['topicId']) {
  const payload = JSON.stringify({ topicId });
  localStorage.setItem(TUTORIAL_ACTIVE_KEY, payload);

  // best-effort notify subscribers (some browsers may not construct storageevent, that's fine)
  try {
    window.dispatchEvent(
      new StorageEvent('storage', { key: TUTORIAL_ACTIVE_KEY, newValue: payload })
    );
  } catch {
    // no-op
  }
}

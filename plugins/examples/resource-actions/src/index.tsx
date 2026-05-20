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

import { registerResourceActionProvider } from '@kinvolk/headlamp-plugin/lib';

// Register custom actions for Kubernetes resources
registerResourceActionProvider((resource, t) => {
  // We only want to contribute actions to Pod resources in this example
  if (resource.kind === 'Pod') {
    return [
      {
        id: 'pod-ping',
        // Custom actions can be localized/translated by calling the contextual `t` function
        label: t('Ping Pod'),
        icon: 'mdi:ping',
        type: 'primary',
        action: res => {
          console.log('Pinged pod:', res.metadata.name);
          alert(`Pinged pod: ${res.metadata.name}`);
        },
      },
      {
        id: 'pod-reset',
        // Example of a secondary action that will show under the 3-dot overflow menu
        // or table row actions
        label: t('Reset Pod Status'),
        icon: 'mdi:refresh',
        type: 'secondary',
        action: res => {
          console.log('Reset status for:', res.metadata.name);
          alert(`Reset status for: ${res.metadata.name}`);
        },
      },
    ];
  }

  // Returning null means no custom actions for other resource types
  return null;
});

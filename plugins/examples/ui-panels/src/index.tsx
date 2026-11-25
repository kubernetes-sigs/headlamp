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

import { registerUIPanel } from '@kinvolk/headlamp-plugin/lib';

/**
 * UI Panel is an element you can add to the sides of the Headlamp UI
 */

registerUIPanel({
  id: 'top-panel',
  side: 'top',
  component: () => (
    <div
      role="region"
      aria-label="top panel"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '50px',
        flexShrink: 0,
        border: '1px solid green',
      }}
    >
      Top Panel
    </div>
  ),
});

registerUIPanel({
  id: 'bottom-panel',
  side: 'bottom',
  component: () => (
    <div
      role="region"
      aria-label="bottom panel"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '50px',
        flexShrink: 0,
        border: '1px solid green',
      }}
    >
      Bottom Panel
    </div>
  ),
});

registerUIPanel({
  id: 'left-panel',
  side: 'left',
  component: () => (
    <div
      role="region"
      aria-label="left panel"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '50px',
        flexShrink: 0,
        border: '1px solid green',
      }}
    >
      Left Panel
    </div>
  ),
});

registerUIPanel({
  id: 'right-panel',
  side: 'right',
  component: () => (
    <div
      role="region"
      aria-label="right panel"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '50px',
        flexShrink: 0,
        border: '1px solid green',
      }}
    >
      Right Panel
    </div>
  ),
});

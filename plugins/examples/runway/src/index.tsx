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
import { SectionBox } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import Typography from '@mui/material/Typography';

// Top-level sidebar group for AI Runway demo content.
registerSidebarEntry({
  parent: null,
  name: 'runway',
  label: 'AI Runway',
  url: '/runway/topology-demo',
  icon: 'mdi:graph-outline',
  useClusterURL: false,
});

registerSidebarEntry({
  parent: 'runway',
  name: 'runway-topology-demo',
  label: 'Topology demo',
  url: '/runway/topology-demo',
  useClusterURL: false,
});

registerRoute({
  path: '/runway/topology-demo',
  sidebar: 'runway-topology-demo',
  name: 'runway-topology-demo',
  exact: true,
  useClusterURL: false,
  noAuthRequired: true,
  component: () => (
    <SectionBox title="AI Runway · Topology demo" paddingTop={2}>
      <Typography>Hello from runway — scaffold OK.</Typography>
    </SectionBox>
  ),
});

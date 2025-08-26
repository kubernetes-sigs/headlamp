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

import {
  ApiProxy,
  registerCustomCreateProject,
  registerProjectDetailsTab,
  registerProjectOverviewSection,
} from '@kinvolk/headlamp-plugin/lib';

function DeployApp({ onBack }) {
  const handleClick = async () => {
    await ApiProxy.apply({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: 'my-project',
        labels: {
          'headlamp.dev/project-id': 'my-project',
        }
      },
    });
    onBack();
  };
  return (
    <div style={{ padding: '30px', width: '500px' }}>
      <h2>Your custom creator</h2>
      <input type="text" />
      <button onClick={handleClick}>Create</button>
    </div>
  );
}

registerCustomCreateProject({
  id: 'my-custom-creator',
  name: 'Deploy Custom project',
  description: 'Custom way to create resources',
  icon: 'mdi:star',
  component: DeployApp,
});

registerProjectDetailsTab({
  id: 'my-tab',
  label: 'Metrics',
  component: ({ project }) => <div>Metrics for project {project.name}</div>,
});

registerProjectOverviewSection({
  id: 'resource-usage',
  component: ({ project }) => <div>Custom resource usage for project {project.name}</div>,
});

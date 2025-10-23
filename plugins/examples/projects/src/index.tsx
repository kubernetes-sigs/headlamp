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
  registerProjectDeleteButton,
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
        },
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
  icon: 'mdi:chart-line',
  component: ({ project }) => <div>Metrics for project {project.id}</div>,
});

// Example of overriding a default tab - Replace the Access tab with custom content
registerProjectDetailsTab({
  id: 'headlamp-projects.tabs.access',
  label: 'Custom Access',
  icon: 'mdi:shield-account',
  component: ({ project, projectResources }) => (
    <div style={{ padding: '20px' }}>
      <h2>Custom Access Management</h2>
      <p>This is a custom implementation that replaces the default Access tab.</p>

      <div
        style={{
          marginTop: '20px',
          padding: '15px',
          backgroundColor: '#f5f5f5',
          borderRadius: '5px',
        }}
      >
        <h3>Project Information</h3>
        <p>
          <strong>Project ID:</strong> {project.id}
        </p>
        <p>
          <strong>Namespaces:</strong> {project.namespaces.join(', ')}
        </p>
        <p>
          <strong>Clusters:</strong> {project.clusters.join(', ')}
        </p>
        <p>
          <strong>Total Resources:</strong> {projectResources.length}
        </p>
      </div>

      <div
        style={{
          marginTop: '20px',
          padding: '15px',
          backgroundColor: '#e8f5e8',
          borderRadius: '5px',
        }}
      >
        <h3>Custom Access Controls</h3>
        <p>Here you could implement:</p>
        <ul>
          <li>Custom role management interface</li>
          <li>Advanced permission controls</li>
          <li>Integration with external identity providers</li>
          <li>Custom access policies</li>
        </ul>
      </div>

      <div
        style={{
          marginTop: '20px',
          padding: '15px',
          backgroundColor: '#fff3cd',
          borderRadius: '5px',
        }}
      >
        <h4>💡 Plugin Implementation Note</h4>
        <p>
          This tab completely replaces the default Access tab by using the same ID:
          <code style={{ backgroundColor: '#f8f9fa', padding: '2px 4px' }}>
            headlamp-projects.tabs.access
          </code>
        </p>
      </div>
    </div>
  ),
});

// Example of removing a default tab by setting component to undefined
// Uncomment the following to remove the Map tab entirely:
// registerProjectDetailsTab({
//   id: 'headlamp-projects.tabs.map',
//   label: 'Map',
//   icon: 'mdi:map',
//   component: undefined,
// });

// Example of Tab that is only enabled for certain projects
registerProjectDetailsTab({
  id: 'special-tab',
  label: 'Special tab',
  icon: 'mdi:circle',
  component: () => <div>Special tab content</div>,
  isEnabled: async ({ project }) => {
    // In this example tab will only be displayed for projects
    // that have more than 1 cluster selected
    // Note: This function is async so you can make network requests here
    return project.clusters.length > 1;
  },
});

registerProjectOverviewSection({
  id: 'resource-usage',
  component: ({ project }) => <div>Custom resource usage for project {project.id}</div>,
});

registerProjectDeleteButton({
  component: ({ project }) => (
    <button
      onClick={() => {
        console.log('Custom delete action');
      }}
    >
      Delete {project.id}
    </button>
  ),
});

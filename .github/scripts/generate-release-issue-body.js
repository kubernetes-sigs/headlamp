#!/usr/bin/env node

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

/**
 * Generate the release coordination issue body or release notes template
 * Usage:
 *   node generate-release-issue-body.js issue <releaseName> <prevTag> <author>
 *   node generate-release-issue-body.js release-notes
 */

const mode = process.argv[2];

if (mode === 'release-notes') {
  const releaseNotesTemplate = `## ✨ Enhancements:
* Feature 1
* Feature 2

## 🐞 Bug fixes
* Fix 1
* Fix 2

## 💻 Development
* Development experience related change 1
* Development experience related change 2

## 📖 Documentation
* Docs change 1
* Docs change 2`;

  console.log(releaseNotesTemplate);
  process.exit(0);
}

if (mode !== 'issue') {
  console.error('Usage:');
  console.error('  node generate-release-issue-body.js issue <releaseName> <prevTag> <author>');
  console.error('  node generate-release-issue-body.js release-notes');
  process.exit(1);
}

const releaseName = process.argv[3];
const prevTag = process.argv[4];
const author = process.argv[5];

if (!releaseName || !prevTag || !author) {
  console.error('Usage: node generate-release-issue-body.js issue <releaseName> <prevTag> <author>');
  process.exit(1);
}

const testBattery = `# Release testing

NOTE: the release isn't frozen yet for testing.

Please write a comment if you're going to test an item and if you've completed testing an item.

- [ ] **Test web sockets**
  - Run the app in static server mode (\`./backend/headlamp-server -static-html-dir ./frontend/build...\`)
  - Open the pods list view
  - Delete a pod using kubectl
  - Verify that the list reflects the changes

- [ ] **App: Run with plugins**
  - Build app with plugins: \`make && make app\`
  - Run the app (UI should load in less than 1 minute)
  - Verify plugins are present: App Catalog, Prometheus, App Catalog

- [ ] **App: Test Prometheus plugin**
  - Run the app
  - Go to the Pods page and choose a pod
  - Verify the Prometheus plugin shows at the top and displays correctly

- [ ] **Image: Test Prometheus plugin**
  - Run headlamp from image
  - Go to the Pods page and choose a pod
  - Verify the Prometheus plugin shows at the top and displays correctly

- [ ] **App: Test Plugin Catalog**
  - Run the app
  - Verify the Plugin Catalog sidebar item is available and open it
  - Verify plugins appear from ArtifactHub
  - Install a plugin
  - Verify the plugin shows as installed
  - Delete the plugin
  - Verify the plugin shows as available to install

- [ ] **Test creating a resource through edit button**
  - Open Headlamp via app or image
  - Choose a cluster where you have admin rights
  - Click Create (bottom left), add a resource (e.g., ConfigMap), and apply
  - Verify the resource is created

- [ ] **Check Workloads page**
  - Open Headlamp via app or image
  - Go to the Workloads page of a cluster with diverse resource types
  - Verify resources and top charts display correctly

- [ ] **Check cluster renaming**
  - Open Headlamp via app or image
  - Open cluster settings
  - Rename the cluster
  - Verify the cluster name changed
  - Reload the app
  - Verify the new name persists

- [ ] **App: Check running on Mac**
  - Open app on Mac
  - Verify it loaded in less than 30 seconds

- [ ] **App: Check running on Windows**
  - Open app on Windows
  - Verify it loaded in less than 30 seconds

- [ ] **App: Check running on Linux**
  - Open app on Linux
  - Verify it loaded in less than 30 seconds

- [ ] **App: Load more than one cluster**
  - Open app
  - Add a new cluster from a kubeconfig file
  - Add another cluster from another kubeconfig file

- [ ] **Flatpak: Install a plugin**
  - Install a plugin from the app catalog
  - Verify it doesn't fail on cross-device linking

- [ ] **App: Load kubeconfig with context != cluster name**
  - Open app
  - Click Add Cluster
  - Choose a kubeconfig where a cluster name differs from the context name
  - Verify the cluster loads successfully

- [ ] **Allowed Namespaces**
  - Open Headlamp in any flavor
  - Configure allowed namespaces in cluster settings
  - Verify views honor allowed namespaces
  - Verify the map honors allowed namespaces

- [ ] **Create resources in the intended cluster**
  - Reproduce: "Create dialog doesn't update cluster when it's changed" (Issue #2441)
  - Verify resource creation targets the intended cluster

- [ ] **Check these plugins have settings**
  - Build a new app
  - Go to Settings > Plugins
  - Click each plugin to verify settings render
  - Plugins: Prometheus, App catalog, Plugin catalog
`;

const releaseNotesTemplate = `## Release Notes

Please fill in the release notes below in the following format and then copy them to the release draft:

### ✨ Enhancements:
* Feature 1
* Feature 2

### 🐞 Bug fixes
* Fix 1
* Fix 2

### 💻 Development
* Development experience related change 1
* Development experience related change 2

### 📖 Documentation
* Docs change 1
* Docs change 2
`;

const issueBody = `${testBattery}

---

## Changelog

@${author}, please run the following command to generate the changelog and paste it here:

\`\`\`bash
git log --oneline --cherry --topo-order ${prevTag}..HEAD
\`\`\`

---

${releaseNotesTemplate}
`;

console.log(issueBody);

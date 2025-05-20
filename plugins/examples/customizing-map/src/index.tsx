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

import { registerMapSource } from '@kinvolk/headlamp-plugin/lib';
import { KubeObject } from '@kinvolk/headlamp-plugin/lib/K8s/cluster';
import { useMemo } from 'react';

// Example custom details component for our resource
function MyResourceDetails({ node }: { node: any }) {
  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Custom Resource Details</h2>
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <div>
          <strong>Name:</strong> {node.kubeObject.metadata.name}
        </div>
        <div>
          <strong>Namespace:</strong> {node.kubeObject.metadata.namespace}
        </div>
        <div>
          <strong>Created:</strong> {node.kubeObject.metadata.creationTimestamp}
        </div>
        {/* Add any custom visualization or interactive elements here */}
        <div style={{ marginTop: '1rem' }}>
          <h3>Resource JSON</h3>
          <pre style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
            {JSON.stringify(node.kubeObject, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

registerMapSource({
  id: 'my-source', // ID of the source should be unique
  label: 'My Source', // label will be displayed in source picker
  // you can provide an icon
  icon: (
    <img
      src="https://headlamp.dev/img/favicon.png"
      alt="My Source logo"
      style={{ width: '100%', height: '100%' }}
    />
  ),
  /**
   * useData is a hook that will be called to load nodes and edges for your source
   * You can use hooks here that Headlamp provides to load Kubernetes resources
   * this hook should return an object with nodes and edges or `null` if it's loading
   * it's important that return object is not recreated every time, so useMemo is required
   */
  useData() {
    return useMemo(() => {
      // Hardcoded kubernetes object as an example
      const myResource = {
        kind: 'MyResourceKind',
        metadata: {
          uid: '1234',
          name: 'my-test-resource',
          namespace: 'test-namespace',
          creationTimestamp: '1234',
        },
      };

      return {
        nodes: [
          {
            id: myResource.metadata.uid, // ID should be unique
            kubeObject: new KubeObject(myResource),
            icon: <img src="https://headlamp.dev/img/favicon.png" alt="MyResourceKind icon" />,
            // Add custom details component to show our own view when the node is selected
            detailsComponent: MyResourceDetails,
          },
        ],
      };
    }, []);
  },
});

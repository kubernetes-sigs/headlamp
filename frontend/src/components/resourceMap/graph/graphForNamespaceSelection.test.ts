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

import type Namespace from '../../../lib/k8s/namespace';
import { getGraphForNamespaceSelection } from './graphForNamespaceSelection';
import { getGraphForSelectedNamespace } from './graphSimplification';

vi.mock('./graphSimplification', () => ({
  getGraphForSelectedNamespace: vi.fn((_filtered, simplified) => simplified),
}));

describe('getGraphForNamespaceSelection', () => {
  const namespace = {
    metadata: { name: 'selected', uid: 'selected-namespace-uid' },
  } as Namespace;

  const filteredGraph = { nodes: [], edges: [] };
  const simplifiedGraph = { nodes: [], edges: [], simplified: true };

  beforeEach(() => vi.clearAllMocks());

  it('passes the namespace name for a selected Namespace UID', () => {
    getGraphForNamespaceSelection(
      filteredGraph,
      simplifiedGraph,
      [namespace],
      namespace.metadata.uid
    );

    expect(getGraphForSelectedNamespace).toHaveBeenCalledWith(
      filteredGraph,
      simplifiedGraph,
      namespace.metadata.name
    );
  });

  it('does not scope a non-namespace selection', () => {
    getGraphForNamespaceSelection(filteredGraph, simplifiedGraph, [namespace], 'pod-uid');

    expect(getGraphForSelectedNamespace).toHaveBeenCalledWith(
      filteredGraph,
      simplifiedGraph,
      undefined
    );
  });
});

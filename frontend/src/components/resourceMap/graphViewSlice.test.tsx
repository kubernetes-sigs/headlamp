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

import { addGraphSource, addKindIcon, graphViewSlice, setGlance } from './graphViewSlice';

describe('graphViewSlice', () => {
  it('returns its initial state for an unknown action', () => {
    expect(graphViewSlice.reducer(undefined, { type: 'unknown' })).toEqual({
      graphSources: [],
      kindIcons: {},
      glances: {},
    });
  });

  it('adds graph sources and rejects duplicate IDs', () => {
    const source = { id: 'workloads', label: 'Workloads', useData: () => null };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const withSource = graphViewSlice.reducer(undefined, addGraphSource(source));
    const withDuplicate = graphViewSlice.reducer(
      withSource,
      addGraphSource({ ...source, label: 'Duplicate' })
    );

    expect(withSource.graphSources).toEqual([source]);
    expect(withDuplicate).toBe(withSource);
    expect(consoleError).toHaveBeenCalledWith('Source with id workloads was already registered');
    consoleError.mockRestore();
  });

  it('indexes kind icons by kind or API group and kind', () => {
    const podIcon = { icon: <span>Pod</span>, color: '#123456' };
    const deploymentIcon = { icon: <span>Deployment</span> };

    let state = graphViewSlice.reducer(
      undefined,
      addKindIcon({ kind: 'Pod', definition: podIcon })
    );
    state = graphViewSlice.reducer(
      state,
      addKindIcon({
        apiGroup: 'apps',
        kind: 'Deployment',
        definition: deploymentIcon,
      })
    );

    expect(state.kindIcons).toEqual({
      Pod: podIcon,
      'apps/Deployment': deploymentIcon,
    });
  });

  it('indexes glances by ID and replaces an existing glance', () => {
    const firstComponent = () => <span>First</span>;
    const replacementComponent = () => <span>Replacement</span>;

    let state = graphViewSlice.reducer(
      undefined,
      setGlance({ id: 'summary', component: firstComponent })
    );
    state = graphViewSlice.reducer(
      state,
      setGlance({ id: 'summary', component: replacementComponent })
    );

    expect(state.glances.summary).toEqual({
      id: 'summary',
      component: replacementComponent,
    });
  });
});

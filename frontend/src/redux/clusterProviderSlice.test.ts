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

import clusterProviderReducer, {
  ClusterEmptyStateComponent,
  initialState,
  setClusterEmptyState,
} from './clusterProviderSlice';

describe('clusterProviderSlice', () => {
  it('starts without a custom cluster empty state', () => {
    expect(clusterProviderReducer(undefined, { type: '' })).toEqual(initialState);
    expect(initialState.clusterEmptyState).toBeNull();
  });

  it('keeps the latest registered cluster empty state', () => {
    const firstEmptyState: ClusterEmptyStateComponent = () => null;
    const secondEmptyState: ClusterEmptyStateComponent = () => null;

    const stateWithFirstRegistration = clusterProviderReducer(
      initialState,
      setClusterEmptyState(firstEmptyState)
    );
    const stateWithSecondRegistration = clusterProviderReducer(
      stateWithFirstRegistration,
      setClusterEmptyState(secondEmptyState)
    );

    expect(stateWithFirstRegistration.clusterEmptyState).toBe(firstEmptyState);
    expect(stateWithSecondRegistration.clusterEmptyState).toBe(secondEmptyState);
  });
});

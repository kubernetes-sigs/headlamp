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

import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';
import { ClusterChooserButton } from './index';

describe('ClusterChooserButton', () => {
  it('shows 0 clusters when clusters have not been loaded', () => {
    const store = configureStore({
      reducer: {
        config: () => ({
          clusters: null,
          allClusters: null,
          statelessClusters: null,
          settings: {},
        }),
      },
    });

    render(
      <Provider store={store}>
        <ClusterChooserButton clickHandler={() => {}} cluster="test" />
      </Provider>
    );

    expect(screen.getByText(/0 clusters/)).toBeTruthy();
  });

  it('shows cluster count from the store', () => {
    const store = configureStore({
      reducer: {
        config: () => ({
          clusters: {
            'my-cluster': { name: 'my-cluster' },
          },
          allClusters: {},
          statelessClusters: null,
          settings: {},
        }),
      },
    });

    render(
      <Provider store={store}>
        <ClusterChooserButton clickHandler={() => {}} cluster="my-cluster" />
      </Provider>
    );

    expect(screen.getByText(/Cluster: my-cluster/)).toBeTruthy();
    expect(screen.getByText(/1 clusters/)).toBeTruthy();
  });

  it('includes stateless clusters in the count', () => {
    const store = configureStore({
      reducer: {
        config: () => ({
          clusters: {
            'regular-cluster': { name: 'regular-cluster' },
          },
          allClusters: {},
          statelessClusters: {
            'stateless-cluster': { name: 'stateless-cluster' },
          },
          settings: {},
        }),
      },
    });

    render(
      <Provider store={store}>
        <ClusterChooserButton clickHandler={() => {}} cluster="regular-cluster" />
      </Provider>
    );

    expect(screen.getByText(/2 clusters/)).toBeTruthy();
  });
});

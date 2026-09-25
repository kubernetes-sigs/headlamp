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

import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import ClusterChooserPopup from './ClusterChooserPopup';

const selectedClusters: string[] = [];
vi.mock('../../lib/k8s', () => ({
  useClustersConf: () => ({
    'cluster-a': { name: 'cluster-a' },
    'cluster-b': { name: 'cluster-b' },
    'cluster-c': { name: 'cluster-c' },
  }),
  useSelectedClusters: () => selectedClusters,
}));

function Wrapper() {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => setAnchor(ref.current), []);
  return (
    <>
      <span ref={ref} />
      <ClusterChooserPopup anchor={anchor} />
    </>
  );
}

describe('ClusterChooserPopup', () => {
  beforeEach(() => {
    localStorage.clear();
    selectedClusters.length = 0;
  });

  it('lists recent clusters most-recent-first', async () => {
    localStorage.setItem('recent_clusters', JSON.stringify(['cluster-c', 'cluster-a']));

    render(
      <TestContext urlPrefix="/c">
        <Wrapper />
      </TestContext>
    );

    const names = (await screen.findAllByRole('option')).map(option => option.id);

    expect(names).toEqual(['cluster-c', 'cluster-a', 'cluster-b']);
  });

  it('does not repeat a cluster listed twice in storage', async () => {
    localStorage.setItem('recent_clusters', JSON.stringify(['cluster-c', 'cluster-c']));

    render(
      <TestContext urlPrefix="/c">
        <Wrapper />
      </TestContext>
    );

    const names = (await screen.findAllByRole('option')).map(option => option.id);

    expect(names).toEqual(['cluster-c', 'cluster-a', 'cluster-b']);
  });

  it('still pins the current cluster above the other recent ones', async () => {
    selectedClusters.push('cluster-a');
    localStorage.setItem('recent_clusters', JSON.stringify(['cluster-c', 'cluster-a']));

    render(
      <TestContext urlPrefix="/c">
        <Wrapper />
      </TestContext>
    );

    const names = (await screen.findAllByRole('option')).map(option => option.id);

    expect(names).toEqual(['cluster-a', 'cluster-c', 'cluster-b']);
  });
});

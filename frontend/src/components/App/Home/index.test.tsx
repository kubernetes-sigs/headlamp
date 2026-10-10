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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { TestContext } from '../../../test';

vi.mock('../../../lib/k8s', () => ({
  useClustersConf: vi.fn(() => ({})),
  useClustersVersion: vi.fn(() => [{}, {}]),
}));

vi.mock('../../../lib/k8s/event', () => ({
  default: class Event {},
  useEventWarningList: vi.fn(() => ({})),
}));

// Keep the test focused on the HEADLAMP_READY wiring by stubbing the heavy children.
vi.mock('./ClusterTable', () => ({ default: () => null }));
vi.mock('./RecentClusters', () => ({ default: () => null }));
vi.mock('../../project/ProjectList', () => ({ default: () => null }));
vi.mock('../../common/SectionBox', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../../helpers/isBackstage', () => ({
  isBackstage: () => true,
}));

import { useClustersConf } from '../../../lib/k8s';
import Home from './index';

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TestContext>
        <Home />
      </TestContext>
    </QueryClientProvider>
  );
}

describe('Home Backstage readiness notification', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    (useClustersConf as Mock).mockReturnValue({
      c1: { name: 'c1' },
      c2: { name: 'c2' },
    });
    vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('notifies the single configured origin once', () => {
    vi.stubEnv('REACT_APP_BACKSTAGE_ORIGIN', 'https://backstage.example.com');

    renderHome();

    expect(window.parent.postMessage).toHaveBeenCalledTimes(1);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      { type: 'HEADLAMP_READY' },
      'https://backstage.example.com'
    );
  });

  it('notifies every configured origin once each', () => {
    vi.stubEnv(
      'REACT_APP_BACKSTAGE_ORIGIN',
      'https://backstage.example.com,https://other-backstage.example.com'
    );

    renderHome();

    expect(window.parent.postMessage).toHaveBeenCalledTimes(2);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      { type: 'HEADLAMP_READY' },
      'https://backstage.example.com'
    );
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      { type: 'HEADLAMP_READY' },
      'https://other-backstage.example.com'
    );
  });

  it('sends nothing when no origin is configured', () => {
    vi.stubEnv('REACT_APP_BACKSTAGE_ORIGIN', '');

    renderHome();

    expect(window.parent.postMessage).not.toHaveBeenCalled();
  });
});

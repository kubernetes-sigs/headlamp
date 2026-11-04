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

import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';
import { ContainersSection } from './Resource';

const theme = createMuiTheme({ base: 'light', name: 'light' });

function renderSection(resource: any) {
  return render(
    <ThemeProvider theme={theme}>
      <TestContext>
        <ContainersSection resource={resource} />
      </TestContext>
    </ThemeProvider>
  );
}

describe('ContainersSection', () => {
  it('uses the "Containers" title for resources with spec.containers', () => {
    renderSection({
      kind: 'Pod',
      metadata: { name: 'my-pod', namespace: 'default', uid: 'pod-uid' },
      spec: { containers: [{ name: 'app-container', image: 'nginx:latest' }] },
      status: {},
    });

    expect(screen.getByRole('heading', { name: 'Containers' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Container Spec' })).not.toBeInTheDocument();
    expect(screen.getByText('app-container')).toBeInTheDocument();
  });

  it('uses the "Container Spec" title for resources with a pod template', () => {
    renderSection({
      kind: 'Deployment',
      metadata: { name: 'my-deployment', namespace: 'default', uid: 'deploy-uid' },
      spec: {
        template: { spec: { containers: [{ name: 'template-container', image: 'nginx:latest' }] } },
      },
      status: {},
    });

    expect(screen.getByRole('heading', { name: 'Container Spec' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Containers' })).not.toBeInTheDocument();
    expect(screen.getByText('template-container')).toBeInTheDocument();
  });

  it('shows the placeholder title and empty state when there is no resource', () => {
    renderSection(null);

    expect(screen.getByRole('heading', { name: '…' })).toBeInTheDocument();
    expect(screen.getByText('No data to be shown.')).toBeInTheDocument();
  });
});

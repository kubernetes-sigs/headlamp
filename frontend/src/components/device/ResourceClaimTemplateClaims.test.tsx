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

import '../../i18n/config';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Pod from '../../lib/k8s/pod';
import ResourceClaim from '../../lib/k8s/resourceClaim';
import ResourceClaimTemplate from '../../lib/k8s/resourceClaimTemplate';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import { podWithResourceClaims } from '../pod/storyHelper';
import ResourceClaimTemplateClaims from './ResourceClaimTemplateClaims';
import { RESOURCE_CLAIM_DUMMY_DATA, RESOURCE_CLAIM_TEMPLATE_DUMMY_DATA } from './storyHelper';

const [singleGpu] = RESOURCE_CLAIM_TEMPLATE_DUMMY_DATA;
const [, sharedClaim] = RESOURCE_CLAIM_DUMMY_DATA;

const generatedClaim = new ResourceClaim({
  ...sharedClaim,
  metadata: { ...sharedClaim.metadata, name: 'trainer-0-gpu-x7k2q' },
});

const theme = createMuiTheme({ base: 'light', name: 'light' });

const listResult = <T,>(items: T[] | null, isError = false) =>
  ({ items, isLoading: false, isError } as any);

function mockLists(pods: Pod[] | null, claims: ResourceClaim[] = [], podsFailed = false) {
  vi.spyOn(Pod, 'useList').mockReturnValue(listResult(pods, podsFailed));
  vi.spyOn(ResourceClaim, 'useList').mockReturnValue(listResult(claims));
}

function renderClaims() {
  render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <ResourceClaimTemplateClaims template={new ResourceClaimTemplate(singleGpu)} />
      </ThemeProvider>
    </TestContext>
  );
}

describe('ResourceClaimTemplateClaims', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows each claim with its Pod and status', () => {
    mockLists([new Pod(podWithResourceClaims)], [generatedClaim]);

    renderClaims();

    expect(screen.getByRole('link', { name: 'trainer-0-gpu-x7k2q' })).toBeVisible();
    expect(screen.getByRole('link', { name: podWithResourceClaims.metadata.name })).toBeVisible();
    expect(screen.getByText('In use by 2')).toBeVisible();
  });

  it('shows a claim that is not generated yet', () => {
    const waiting = new Pod({
      ...podWithResourceClaims,
      status: { ...podWithResourceClaims.status, resourceClaimStatuses: undefined },
    });
    mockLists([waiting]);

    renderClaims();

    expect(screen.getByText('Not generated yet')).toBeVisible();
  });

  it('says so when no Pod uses the template', () => {
    mockLists([]);

    renderClaims();

    expect(screen.getByRole('status')).toHaveTextContent('No Pods use this template yet.');
  });

  it('reports a Pod list that failed', () => {
    mockLists(null, [], true);

    renderClaims();

    expect(screen.getByText('Unable to list the Pods that use this template.')).toBeVisible();
  });
});

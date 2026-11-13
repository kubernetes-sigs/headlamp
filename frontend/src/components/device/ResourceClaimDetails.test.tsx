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
import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import App from '../../App';
import ResourceClaim from '../../lib/k8s/resourceClaim';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import ResourceClaimAllocatedDevices from './ResourceClaimAllocatedDevices';
import ResourceClaimConsumers from './ResourceClaimConsumers';
import { RESOURCE_CLAIM_DUMMY_DATA } from './storyHelper';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const theme = createMuiTheme({ base: 'light', name: 'light' });

const renderInContext = (ui: ReactElement) =>
  render(
    <TestContext>
      <ThemeProvider theme={theme}>{ui}</ThemeProvider>
    </TestContext>
  );

const cluster = 'gpu-cluster';
const [pendingClaim, sharedClaim, fallbackClaim] = RESOURCE_CLAIM_DUMMY_DATA.map(
  claim => new ResourceClaim(claim, cluster)
);

describe('ResourceClaimAllocatedDevices', () => {
  it('lists each granted device with its pool and driver', () => {
    renderInContext(<ResourceClaimAllocatedDevices claim={sharedClaim} />);

    const row = screen.getByText('gpu-5').closest('tr')!;
    expect(within(row).getByText('gpu')).toBeVisible();
    expect(within(row).getByText('gpu.example.com')).toBeVisible();
    expect(screen.queryByText('Chosen Alternative')).not.toBeInTheDocument();
  });

  it('names the alternative the scheduler chose from a prioritized list', () => {
    renderInContext(<ResourceClaimAllocatedDevices claim={fallbackClaim} />);

    const row = screen.getByText('gpu-6').closest('tr')!;
    expect(within(row).getByText('gpu')).toBeVisible();
    expect(within(row).getByText('small')).toBeVisible();
    expect(screen.getByText('Chosen Alternative')).toBeVisible();
  });

  it('says that a pending claim has no devices yet', () => {
    renderInContext(<ResourceClaimAllocatedDevices claim={pendingClaim} />);

    expect(screen.getByRole('status')).toHaveTextContent('No devices are allocated yet.');
  });
});

describe('ResourceClaimConsumers', () => {
  it('links every Pod reserved for the claim to its page', () => {
    renderInContext(<ResourceClaimConsumers claim={sharedClaim} />);

    for (const pod of ['trainer-0', 'trainer-1']) {
      expect(screen.getByRole('link', { name: pod })).toHaveAttribute(
        'href',
        `/c/${cluster}/pods/default/${pod}`
      );
    }
  });

  it('shows a consumer of another resource without a link', () => {
    const claim = new ResourceClaim(
      {
        ...RESOURCE_CLAIM_DUMMY_DATA[1],
        status: {
          ...RESOURCE_CLAIM_DUMMY_DATA[1].status,
          reservedFor: [
            { apiGroup: 'batch.example.com', resource: 'trainers', name: 'run-1', uid: 'u' },
          ],
        },
      },
      cluster
    );
    renderInContext(<ResourceClaimConsumers claim={claim} />);

    expect(screen.getByText('trainers.batch.example.com')).toBeVisible();
    expect(screen.getByText('run-1')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('says that nothing uses a pending claim', () => {
    renderInContext(<ResourceClaimConsumers claim={pendingClaim} />);

    expect(screen.getByRole('status')).toHaveTextContent('Nothing uses this claim yet.');
  });
});

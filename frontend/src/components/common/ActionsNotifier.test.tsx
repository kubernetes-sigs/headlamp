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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { ClusterAction } from '../../redux/clusterActionSlice';
import { PureActionsNotifier } from './ActionsNotifier';

function renderNotifier(clusterAction: ClusterAction) {
  return render(
    <MemoryRouter>
      <SnackbarProvider>
        <PureActionsNotifier
          dispatch={() => {}}
          clusterActions={{ [clusterAction.id]: clusterAction }}
        />
      </SnackbarProvider>
    </MemoryRouter>
  );
}

describe('ActionsNotifier', () => {
  it('lets a warning snackbar be dismissed', async () => {
    renderNotifier({
      id: 'apply',
      message: 'Applied priv.\n• would violate PodSecurity',
      snackbarProps: { variant: 'warning' },
    });

    expect(await screen.findByText(/would violate PodSecurity/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(screen.queryByText(/would violate PodSecurity/)).not.toBeInTheDocument();
    });
  });

  it('does not add a close button to other snackbars', async () => {
    renderNotifier({
      id: 'apply',
      message: 'Applied priv.',
      snackbarProps: { variant: 'success' },
    });

    expect(await screen.findByText('Applied priv.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });
});

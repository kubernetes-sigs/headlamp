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

import '../../../i18n/config';
import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../../lib/themes';
import { findKubeconfigByClusterName } from '../../../stateless/findKubeconfigByClusterName';
import { TestContext } from '../../../test';
import { ClusterNameEditor } from './ClusterNameEditor';

vi.mock('../../../stateless/findKubeconfigByClusterName', () => ({
  findKubeconfigByClusterName: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('shows the backend ambiguity error without changing the cluster name', async () => {
  const cluster = 'a--b--c';
  const message = `ambiguous DNS-friendly cluster name "${cluster}"`;
  const setClusterSettings = vi.fn();
  vi.mocked(findKubeconfigByClusterName).mockResolvedValue(null);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(`${message}\n`, {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    )
  );

  render(
    <TestContext>
      <ThemeProvider theme={createMuiTheme({ name: 'Light', base: 'light' })}>
        <ClusterNameEditor
          cluster={cluster}
          clusterConf={{
            [cluster]: { name: cluster, auth_type: '', meta_data: { source: 'kubeconfig' } },
          }}
          clusterSettings={{ currentName: cluster }}
          setClusterSettings={setClusterSettings}
        />
      </ThemeProvider>
    </TestContext>
  );

  const input = screen.getByRole('textbox', { name: 'Name' });
  fireEvent.change(input, { target: { value: 'renamed-cluster' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  const dialog = await screen.findByRole('dialog', { name: 'Error' });
  expect(within(dialog).getByText(`Bad Request - ${message}`)).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining(`/cluster/${cluster}`),
    expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({
        newClusterName: 'renamed-cluster',
        source: 'kubeconfig',
        stateless: false,
      }),
    })
  );
  expect(setClusterSettings).not.toHaveBeenCalled();
  expect(input).toHaveValue('renamed-cluster');
});

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
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import { PureKubeConfigLoader, Step } from './KubeConfigLoader';

// KubeConfigLoader transitively pulls in k8s resource classes which have a
// circular dependency that breaks module initialisation in the test
// environment. Mock the modules that trigger that chain.
vi.mock('../../lib/k8s', () => ({ useClustersConf: vi.fn() }));
vi.mock('../../lib/k8s/api/v1/clusterApi', () => ({ setCluster: vi.fn() }));

function renderLoader() {
  render(
    <TestContext>
      <ThemeProvider theme={createMuiTheme({ name: 'test' })}>
        <PureKubeConfigLoader
          step={Step.LoadKubeConfig}
          fileContent={{ clusters: [], users: [], contexts: [], currentContext: '' }}
          selectedClusters={[]}
          onDrop={vi.fn()}
          onCheckboxChange={vi.fn()}
          onNext={vi.fn()}
          onBack={vi.fn()}
          onFinish={vi.fn()}
          onCancel={vi.fn()}
        />
      </ThemeProvider>
    </TestContext>
  );
}

it('names the kubeconfig file input', () => {
  renderLoader();

  expect(
    screen.getByLabelText('Drag & drop or choose kubeconfig file here', { selector: 'input' })
  ).toHaveAttribute('type', 'file');
});

it('opens the file dialog once when the choose file button is clicked', async () => {
  const click = vi.spyOn(HTMLInputElement.prototype, 'click');
  renderLoader();

  // The tooltip gives the button its accessible name, so match on its text instead.
  await userEvent.click(screen.getByText('Choose file'));

  expect(click).toHaveBeenCalledTimes(1);
  click.mockRestore();
});

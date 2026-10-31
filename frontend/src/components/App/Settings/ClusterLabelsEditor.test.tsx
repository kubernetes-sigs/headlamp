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
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { storeClusterSettings } from '../../../helpers/clusterSettings';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';

// Like CreateResourceForm.test.tsx: the labels editor comes from CreateResourceForm, which
// imports Namespace, and that is enough to pull in the lib/k8s barrel and its import cycle.
vi.mock('../../../lib/k8s/namespace', () => ({
  default: { useList: () => [[], null] },
}));

const { default: ClusterLabelsDialog, getClusterLabelRowProblems } = await import(
  './ClusterLabelsEditor'
);

const theme = createMuiTheme({ base: 'light', name: 'light' });

function renderDialog(onClose = vi.fn()) {
  render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <ClusterLabelsDialog open cluster="my-cluster" onClose={onClose} />
      </ThemeProvider>
    </TestContext>
  );
  return within(screen.getByRole('dialog'));
}

function storedLabels() {
  return JSON.parse(localStorage.getItem('cluster_settings.my-cluster') || '{}').labels;
}

describe('getClusterLabelRowProblems', () => {
  it('reports rows without a key, duplicate keys and invalid labels', () => {
    expect(
      getClusterLabelRowProblems([
        { key: 'environment', value: 'production' },
        { key: '', value: 'eu-west' },
        { key: 'environment', value: 'staging' },
        { key: 'bad key', value: 'x' },
        { key: 'team', value: '-platform' },
      ])
    ).toEqual({
      emptyKeyCount: 1,
      duplicateKeys: ['environment'],
      invalidKeys: ['bad key', 'team'],
    });
  });

  it('reports nothing for valid rows', () => {
    expect(
      getClusterLabelRowProblems([
        { key: 'environment', value: 'production' },
        { key: 'example.com/team', value: '' },
      ])
    ).toEqual({ emptyKeyCount: 0, duplicateKeys: [], invalidKeys: [] });
  });
});

describe('ClusterLabelsDialog', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('does not delete a saved label when its key is cleared', async () => {
    storeClusterSettings('my-cluster', { labels: { environment: 'production' } });
    const dialog = renderDialog();

    await userEvent.clear(dialog.getByRole('textbox', { name: 'Label key' }));

    expect(dialog.getByRole('alert')).toHaveTextContent('Every label needs a key');
    expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(storedLabels()).toEqual({ environment: 'production' });
  });

  it('does not save duplicate keys', async () => {
    storeClusterSettings('my-cluster', { labels: { environment: 'production' } });
    const dialog = renderDialog();

    await userEvent.click(dialog.getByRole('button', { name: 'Add label' }));
    const keys = dialog.getAllByRole('textbox', { name: 'Label key' });
    await userEvent.clear(keys[1]);
    await userEvent.type(keys[1], 'environment');

    expect(dialog.getByRole('alert')).toHaveTextContent('Duplicate label keys: environment');
    expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves valid labels', async () => {
    const onClose = vi.fn();
    const dialog = renderDialog(onClose);

    await userEvent.click(dialog.getByRole('button', { name: 'Add label' }));
    await userEvent.clear(dialog.getByRole('textbox', { name: 'Label key' }));
    await userEvent.type(dialog.getByRole('textbox', { name: 'Label key' }), 'environment');
    await userEvent.type(dialog.getByRole('textbox', { name: 'Label value' }), 'production');
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));

    expect(storedLabels()).toEqual({ environment: 'production' });
    expect(onClose).toHaveBeenCalled();
  });
});

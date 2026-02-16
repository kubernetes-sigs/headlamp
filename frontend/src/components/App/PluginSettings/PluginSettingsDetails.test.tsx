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
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PluginInfo, PluginSettingsDetailsProps } from '../../../plugin/pluginsSlice';
import { TestContext } from '../../../test';
import { theme } from '../../TestHelpers/theme';
import { PluginSettingsDetailsPure } from './PluginSettingsDetails';

function TestSettingsComponent(props: PluginSettingsDetailsProps) {
  const { data, onDataChange } = props;

  return (
    <>
      <span data-testid="current-value">{data?.value || ''}</span>
      <button onClick={() => onDataChange?.({ value: 'updated' })} type="button">
        Update Value
      </button>
    </>
  );
}

function makePlugin(displaySaveButton: boolean): PluginInfo {
  return {
    name: 'test-plugin',
    description: 'Test plugin',
    homepage: 'https://example.com',
    settingsComponent: TestSettingsComponent,
    displaySettingsComponentWithSaveButton: displaySaveButton,
  };
}

describe('PluginSettingsDetailsPure', () => {
  it('passes props and auto-saves changes when save button is disabled', async () => {
    const onSave = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <TestContext>
          <PluginSettingsDetailsPure
            config={{ value: 'initial' }}
            plugin={makePlugin(false)}
            onSave={onSave}
            onDelete={vi.fn()}
          />
        </TestContext>
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-value')).toHaveTextContent('initial');

    fireEvent.click(screen.getByRole('button', { name: 'Update Value' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ value: 'updated' });
    });
  });

  it('passes props but does not auto-save changes when save button is enabled', () => {
    const onSave = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <TestContext>
          <PluginSettingsDetailsPure
            config={{ value: 'initial' }}
            plugin={makePlugin(true)}
            onSave={onSave}
            onDelete={vi.fn()}
          />
        </TestContext>
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-value')).toHaveTextContent('initial');

    fireEvent.click(screen.getByRole('button', { name: 'Update Value' }));

    expect(onSave).not.toHaveBeenCalled();
  });
});

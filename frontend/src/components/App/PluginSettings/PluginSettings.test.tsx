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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../../lib/themes';
import { PluginInfo } from '../../../plugin/pluginsSlice';
import { TestContext } from '../../../test';
import { PluginSettingsPure } from './PluginSettings';

vi.mock('../../../helpers/isElectron', () => ({
  isElectron: () => true,
}));

const theme = createMuiTheme({ name: 'light', base: 'light' });

function createPlugins(count: number): PluginInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `plugin-${i}`,
    description: `Description for plugin ${i}`,
    isEnabled: true,
    isCompatible: true,
    isLoaded: true,
    type: 'user' as const,
    homepage: '',
  }));
}

function renderPluginSettings(
  props: Partial<React.ComponentProps<typeof PluginSettingsPure>> = {}
) {
  const defaultProps = {
    plugins: createPlugins(3),
    onSave: vi.fn(),
    onDelete: vi.fn(),
    ...props,
  };

  return render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <PluginSettingsPure {...defaultProps} />
      </ThemeProvider>
    </TestContext>
  );
}

describe('PluginSettingsPure', () => {
  let confirmSpy: { mockRestore: () => void } | undefined;

  afterEach(() => {
    confirmSpy?.mockRestore();
    confirmSpy = undefined;
  });

  it('renders the delete button for each plugin', () => {
    renderPluginSettings();

    const deleteButtons = screen.getAllByLabelText('Delete Plugin');
    expect(deleteButtons).toHaveLength(3);
  });

  it('calls onDelete when delete is confirmed', () => {
    const onDelete = vi.fn();
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPluginSettings({ plugins: createPlugins(2), onDelete });

    const deleteButtons = screen.getAllByLabelText('Delete Plugin');
    fireEvent.click(deleteButtons[0]);

    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ name: 'plugin-0' }));
  });

  it('does not call onDelete when delete is cancelled', () => {
    const onDelete = vi.fn();
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderPluginSettings({ plugins: createPlugins(2), onDelete });

    const deleteButtons = screen.getAllByLabelText('Delete Plugin');
    fireEvent.click(deleteButtons[0]);

    expect(onDelete).not.toHaveBeenCalled();
  });

  it('removes the plugin from the list after deletion', () => {
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPluginSettings();

    expect(screen.getAllByLabelText('Delete Plugin')).toHaveLength(3);

    fireEvent.click(screen.getAllByLabelText('Delete Plugin')[0]);

    expect(screen.getAllByLabelText('Delete Plugin')).toHaveLength(2);
  });

  it('can delete multiple plugins consecutively', () => {
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPluginSettings();

    fireEvent.click(screen.getAllByLabelText('Delete Plugin')[0]);
    expect(screen.getAllByLabelText('Delete Plugin')).toHaveLength(2);

    fireEvent.click(screen.getAllByLabelText('Delete Plugin')[0]);
    expect(screen.getAllByLabelText('Delete Plugin')).toHaveLength(1);
  });

  it('does not show delete button for shipped plugins', () => {
    const plugins: PluginInfo[] = [
      {
        name: 'shipped-plugin',
        description: 'A shipped plugin',
        isEnabled: true,
        isCompatible: true,
        isLoaded: true,
        type: 'shipped',
        homepage: '',
      },
      {
        name: 'user-plugin',
        description: 'A user plugin',
        isEnabled: true,
        isCompatible: true,
        isLoaded: true,
        type: 'user',
        homepage: '',
      },
    ];

    renderPluginSettings({ plugins });

    const deleteButtons = screen.getAllByLabelText('Delete Plugin');
    expect(deleteButtons).toHaveLength(1);
  });

  it('only removes the matching version when plugins share a name', () => {
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const plugins: PluginInfo[] = [
      {
        name: 'shared-name',
        description: 'User version',
        isEnabled: true,
        isCompatible: true,
        isLoaded: true,
        type: 'user',
        homepage: '',
      },
      {
        name: 'shared-name',
        description: 'Development version',
        isEnabled: true,
        isCompatible: true,
        isLoaded: true,
        type: 'development',
        homepage: '',
      },
    ];

    renderPluginSettings({ plugins });

    expect(screen.getAllByLabelText('Delete Plugin')).toHaveLength(2);

    fireEvent.click(screen.getAllByLabelText('Delete Plugin')[0]);

    expect(screen.getAllByLabelText('Delete Plugin')).toHaveLength(1);
  });

  it('restores the row when onDelete fails', async () => {
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDelete = vi.fn().mockRejectedValue(new Error('boom'));

    renderPluginSettings({ plugins: createPlugins(2), onDelete });

    expect(screen.getAllByLabelText('Delete Plugin')).toHaveLength(2);

    fireEvent.click(screen.getAllByLabelText('Delete Plugin')[0]);

    // Wait for the async onDelete rejection to be handled and the row to be restored.
    await waitFor(() => {
      expect(screen.getAllByLabelText('Delete Plugin')).toHaveLength(2);
    });
  });
});

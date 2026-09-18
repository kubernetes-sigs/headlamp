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
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_POD_DEBUG_IMAGE } from '../../../helpers/clusterSettings';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';
import PodDebugSettings from './PodDebugSettings';

const { mockUseTypedSelector } = vi.hoisted(() => ({ mockUseTypedSelector: vi.fn() }));
const theme = createMuiTheme({ name: 'Light', base: 'light' });

vi.mock('../../../redux/hooks', () => ({
  useTypedSelector: mockUseTypedSelector,
}));

vi.mock('../../common/SectionBox', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function renderSettings(
  clusterSettings: React.ComponentProps<typeof PodDebugSettings>['clusterSettings'] = {},
  defaultPodDebugImage?: string
) {
  const setClusterSettings = vi.fn();
  mockUseTypedSelector.mockImplementation(selector =>
    selector({ config: { defaultPodDebugImage } })
  );

  render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <PodDebugSettings
          cluster="test"
          clusterSettings={clusterSettings}
          setClusterSettings={setClusterSettings}
        />
      </ThemeProvider>
    </TestContext>
  );

  return setClusterSettings;
}

describe('PodDebugSettings', () => {
  it('uses configured pod debug values', () => {
    renderSettings(
      {
        podDebugTerminal: {
          debugImage: 'registry.example/debug:latest',
          isEnabled: false,
        },
      },
      'registry.example/default:latest'
    );

    expect(screen.getByRole('textbox')).toHaveValue('registry.example/debug:latest');
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'placeholder',
      'registry.example/default:latest'
    );
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('uses fallback pod debug values', () => {
    renderSettings();

    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', DEFAULT_POD_DEBUG_IMAGE);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('labels the debug image textbox', () => {
    renderSettings();

    expect(screen.getByRole('textbox', { name: /Debug Image$/ })).toBeInTheDocument();
  });

  it('removes whitespace when updating the debug image', () => {
    const setClusterSettings = renderSettings();

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'registry.example/ debug\timage:\nlatest' },
    });

    const update = setClusterSettings.mock.calls[0][0];
    expect(update({ podDebugTerminal: { isEnabled: true } })).toEqual({
      podDebugTerminal: {
        debugImage: 'registry.example/debugimage:latest',
        isEnabled: true,
      },
    });
  });

  it('updates whether pod debugging is enabled', () => {
    const setClusterSettings = renderSettings();

    fireEvent.click(screen.getByRole('checkbox'));

    const update = setClusterSettings.mock.calls[0][0];
    expect(update({ podDebugTerminal: { debugImage: 'busybox' } })).toEqual({
      podDebugTerminal: {
        debugImage: 'busybox',
        isEnabled: false,
      },
    });
  });
});

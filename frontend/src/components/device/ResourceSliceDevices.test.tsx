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
import { describe, expect, it } from 'vitest';
import App from '../../App';
import type { KubeResourceSlice } from '../../lib/k8s/resourceSlice';
import ResourceSlice from '../../lib/k8s/resourceSlice';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import ResourceSliceDevices from './ResourceSliceDevices';
import { RESOURCE_SLICE_DUMMY_DATA } from './storyHelper';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const theme = createMuiTheme({ base: 'light', name: 'light' });

const [nodeSlice] = RESOURCE_SLICE_DUMMY_DATA;

const renderDevices = (slice: KubeResourceSlice) =>
  render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <ResourceSliceDevices slice={new ResourceSlice(slice, 'gpu-cluster')} />
      </ThemeProvider>
    </TestContext>
  );

describe('ResourceSliceDevices', () => {
  it('lists every device the slice publishes', () => {
    renderDevices(nodeSlice);

    for (const name of ['gpu-0', 'gpu-1', 'gpu-2', 'gpu-3']) {
      expect(screen.getByText(name)).toBeVisible();
    }
  });

  it('says when the slice publishes no devices', () => {
    renderDevices({ ...nodeSlice, spec: { ...nodeSlice.spec, devices: undefined } });

    expect(screen.getByText('This slice publishes no devices.', { selector: 'p' })).toBeVisible();
  });
});

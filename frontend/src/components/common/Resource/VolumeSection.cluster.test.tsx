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
import { describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';
import { VolumeSection } from './Resource';

// Record the cluster each volume link is opened in, without the router or drawer.
vi.mock('../Link', () => ({
  default: (props: any) => (
    <a
      href={`/${props.routeName}/${props.params.namespace}/${props.params.name}`}
      data-active-cluster={props.activeCluster}
    >
      {props.children}
    </a>
  ),
}));

const theme = createMuiTheme({ base: 'light', name: 'light' });

const pod = {
  kind: 'Pod',
  metadata: { name: 'web', namespace: 'apps' },
  spec: {
    volumes: [
      { name: 'settings', configMap: { name: 'app-settings' } },
      { name: 'creds', secret: { secretName: 'app-creds' } },
      { name: 'data', persistentVolumeClaim: { claimName: 'app-data' } },
    ],
  },
} as any;

describe('VolumeSection', () => {
  it("links each volume to the resource's own cluster", () => {
    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <VolumeSection resource={pod} cluster="cluster-b" />
        </ThemeProvider>
      </TestContext>
    );

    for (const name of ['settings', 'creds', 'data']) {
      expect(screen.getByRole('link', { name })).toHaveAttribute(
        'data-active-cluster',
        'cluster-b'
      );
    }
  });
});

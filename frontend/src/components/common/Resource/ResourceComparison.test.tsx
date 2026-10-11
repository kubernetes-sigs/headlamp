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
import { fireEvent, render, screen } from '@testing-library/react';
import type { KubeObjectInterface } from '../../../lib/k8s/KubeObject';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';
import ResourceComparison from './ResourceComparison';

// Monaco does not run in jsdom, so render the texts it receives instead.
vi.mock('@monaco-editor/react', () => ({
  DiffEditor: ({ original, modified }: { original: string; modified: string }) => (
    <div>
      <pre data-testid="diff-original">{original}</pre>
      <pre data-testid="diff-modified">{modified}</pre>
    </div>
  ),
}));

const theme = createMuiTheme({ name: 'light', base: 'light' });

function makeConfigMap(
  uid: string,
  data: Record<string, string>,
  extraMetadata: Record<string, unknown> = {}
): KubeObjectInterface {
  return {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: 'app-config',
      namespace: 'default',
      uid,
      resourceVersion: uid,
      creationTimestamp: '2026-01-01T00:00:00Z',
      ...extraMetadata,
    },
    data,
  } as KubeObjectInterface;
}

function renderComparison(original: KubeObjectInterface, modified: KubeObjectInterface) {
  return render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <ResourceComparison
          original={original}
          modified={modified}
          originalLabel="staging / default / app-config"
          modifiedLabel="prod / default / app-config"
        />
      </ThemeProvider>
    </TestContext>
  );
}

describe('ResourceComparison', () => {
  it('reports objects that only differ in server-populated fields as identical', () => {
    renderComparison(
      makeConfigMap('a', { LOG_LEVEL: 'info' }),
      makeConfigMap('b', { LOG_LEVEL: 'info' })
    );

    expect(screen.getByText('The objects are identical')).toBeInTheDocument();
    expect(screen.getByText('staging / default / app-config')).toBeInTheDocument();
    expect(screen.getByText('prod / default / app-config')).toBeInTheDocument();
    expect(screen.getByTestId('diff-original').textContent).not.toContain('uid');
    expect(screen.getByTestId('diff-modified').textContent).not.toContain('resourceVersion');
  });

  it('counts fields that differ on either side', () => {
    renderComparison(
      makeConfigMap('a', { LOG_LEVEL: 'info', ONLY_STAGING: 'x' }),
      makeConfigMap('b', { LOG_LEVEL: 'debug', ONLY_PROD: 'y' })
    );

    expect(screen.getByText('3 fields differ')).toBeInTheDocument();
    expect(screen.getByTestId('diff-original').textContent).toContain('LOG_LEVEL: info');
    expect(screen.getByTestId('diff-modified').textContent).toContain('LOG_LEVEL: debug');
  });

  it('uses the singular when one field differs', () => {
    renderComparison(
      makeConfigMap('a', { LOG_LEVEL: 'info' }),
      makeConfigMap('b', { LOG_LEVEL: 'debug' })
    );

    expect(screen.getByText('1 field differs')).toBeInTheDocument();
  });

  it('sorts keys, so a different field order is not shown as a change', () => {
    const original = makeConfigMap('a', { B: '2', A: '1' });
    const modified = makeConfigMap('b', { A: '1', B: '2' });
    renderComparison(original, modified);

    expect(screen.getByTestId('diff-original').textContent).toBe(
      screen.getByTestId('diff-modified').textContent
    );
  });

  it('shows server-populated fields when asked', () => {
    renderComparison(
      makeConfigMap('a', { LOG_LEVEL: 'info' }),
      makeConfigMap('b', { LOG_LEVEL: 'info' })
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show server-populated fields' }));

    // uid and resourceVersion differ.
    expect(screen.getByText('2 fields differ')).toBeInTheDocument();
    expect(screen.getByTestId('diff-original').textContent).toContain('uid: a');
    expect(screen.getByTestId('diff-modified').textContent).toContain('uid: b');
  });
});

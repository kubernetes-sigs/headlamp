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
import { LAST_APPLIED_ANNOTATION } from './lastAppliedConfiguration';
import LastAppliedDiff from './LastAppliedDiff';

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

const applied = {
  apiVersion: 'v1',
  kind: 'ConfigMap',
  metadata: { annotations: {}, name: 'app-config', namespace: 'default' },
  data: { LOG_LEVEL: 'info' },
};

function makeConfigMap(
  data: Record<string, string>,
  annotation: string | null = JSON.stringify(applied)
): KubeObjectInterface {
  return {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: 'app-config',
      namespace: 'default',
      uid: 'abc',
      resourceVersion: '42',
      creationTimestamp: '2025-01-01T00:00:00Z',
      annotations: annotation ? { [LAST_APPLIED_ANNOTATION]: annotation } : undefined,
    },
    data,
  } as KubeObjectInterface;
}

function renderDiff(item: KubeObjectInterface) {
  return render(
    <ThemeProvider theme={theme}>
      <TestContext>
        <LastAppliedDiff item={item} />
      </TestContext>
    </ThemeProvider>
  );
}

describe('LastAppliedDiff', () => {
  it('renders nothing without the annotation', () => {
    const { container } = renderDiff(makeConfigMap({ LOG_LEVEL: 'info' }, null));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the annotation is invalid', () => {
    const { container } = renderDiff(makeConfigMap({ LOG_LEVEL: 'info' }, '{not json'));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows in sync when the live object matches', () => {
    renderDiff(makeConfigMap({ LOG_LEVEL: 'info' }));
    expect(screen.getByText('In sync with the last applied configuration')).toBeInTheDocument();
  });

  it('shows the number of differing fields', () => {
    renderDiff(makeConfigMap({ LOG_LEVEL: 'debug' }));
    expect(
      screen.getByText('1 field differs from the last applied configuration')
    ).toBeInTheDocument();
  });

  it('shows the diff on demand, with server fields stripped', () => {
    renderDiff(makeConfigMap({ LOG_LEVEL: 'debug', EXTRA: 'added' }));
    expect(screen.queryByTestId('diff-original')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show diff' }));

    const original = screen.getByTestId('diff-original').textContent!;
    const modified = screen.getByTestId('diff-modified').textContent!;
    expect(original).toContain('LOG_LEVEL: info');
    expect(modified).toContain('LOG_LEVEL: debug');
    // Fields only in the live object are hidden by default.
    expect(modified).not.toContain('EXTRA');
    for (const serverField of ['uid', 'resourceVersion', 'creationTimestamp', 'last-applied']) {
      expect(modified).not.toContain(serverField);
    }

    fireEvent.click(screen.getByRole('checkbox', { name: 'Only show applied fields' }));
    expect(screen.getByTestId('diff-modified').textContent).toContain('EXTRA: added');

    fireEvent.click(screen.getByRole('button', { name: 'Hide diff' }));
    expect(screen.queryByTestId('diff-original')).not.toBeInTheDocument();
  });
});

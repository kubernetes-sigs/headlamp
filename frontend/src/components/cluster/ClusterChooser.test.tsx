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
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import ClusterChooser from './ClusterChooser';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: 'en',
    },
  }),
}));

const theme = createMuiTheme({ name: 'test' });

function renderClusterChooser(props: Partial<React.ComponentProps<typeof ClusterChooser>> = {}) {
  return render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <ClusterChooser clickHandler={vi.fn()} cluster="cluster-a" {...props} />
      </ThemeProvider>
    </TestContext>
  );
}

describe('ClusterChooser', () => {
  it('uses the selected cluster label when one selected cluster differs from the route cluster', () => {
    renderClusterChooser({
      selectedClusters: ['cluster-b'],
    });

    expect(screen.getByText('cluster-b')).toBeInTheDocument();
    expect(screen.queryByText('cluster-a')).not.toBeInTheDocument();
  });
});

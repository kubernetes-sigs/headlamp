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
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import { GRPCRuleMatches } from './GRPCRouteDetails';

const theme = createMuiTheme({ base: 'light', name: 'light' });

const renderWithTheme = (ui: ReactElement) =>
  render(
    <TestContext>
      <ThemeProvider theme={theme}>{ui}</ThemeProvider>
    </TestContext>
  );

describe('GRPCRuleMatches', () => {
  it('lists each header match by name and value, and shows a non-default match type', () => {
    renderWithTheme(
      <GRPCRuleMatches
        matches={[
          {
            method: { type: 'Exact', service: 'com.example.UserService', method: 'GetUser' },
            headers: [
              { name: 'x-environment', value: 'production' },
              { type: 'Exact', name: 'x-region', value: 'eu' },
              { type: 'RegularExpression', name: 'x-user-id', value: '^beta-[0-9]+$' },
            ],
          },
        ]}
      />
    );

    expect(screen.getByText('x-environment: production')).toBeInTheDocument();
    expect(screen.getByText('x-region: eu')).toBeInTheDocument();
    expect(screen.getByText('x-user-id: ^beta-[0-9]+$ (RegularExpression)')).toBeInTheDocument();
  });

  it('leaves the headers cell empty when a match has no header matches', () => {
    renderWithTheme(
      <GRPCRuleMatches matches={[{ method: { service: 'com.example.UserService' } }]} />
    );

    expect(screen.queryByText(/:/)).not.toBeInTheDocument();
  });
});

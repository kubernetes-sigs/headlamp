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
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import { WebhookMatchConditions } from './Details';

const theme = createMuiTheme({ base: 'light', name: 'light' });

describe('WebhookMatchConditions', () => {
  it('lists the name and CEL expression of each match condition', () => {
    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <WebhookMatchConditions
            matchConditions={[
              { name: 'exclude-leases', expression: 'request.resource.resource != "leases"' },
              {
                name: 'exclude-kubelet-requests',
                expression: '!("system:nodes" in request.userInfo.groups)',
              },
            ]}
          />
        </ThemeProvider>
      </TestContext>
    );

    expect(screen.getByText('exclude-leases')).toBeInTheDocument();
    expect(screen.getByText('request.resource.resource != "leases"')).toBeInTheDocument();
    expect(screen.getByText('exclude-kubelet-requests')).toBeInTheDocument();
    expect(screen.getByText('!("system:nodes" in request.userInfo.groups)')).toBeInTheDocument();
  });
});

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

import { render, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import React from 'react';
import App from './App';

vi.mock('./components/common/ReleaseNotes/ReleaseNotes', () => ({
  default: () => <div data-testid="release-notes" />,
}));

const server = setupServer(
  http.get('*/plugins', () => HttpResponse.json([])),
  http.get('*/config', () => HttpResponse.json({ clusters: [] }))
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterAll(() => server.close());

test('renders application UI after startup is ready', async () => {
  const { getByLabelText, getByTestId, getByText, queryByTestId, queryByText } = render(
    <React.Suspense fallback="Loading...">
      <App />
    </React.Suspense>
  );

  expect(getByLabelText('Loading')).toHaveClass('MuiCircularProgress-colorInherit');
  expect(getByLabelText('Loading')).not.toHaveClass('MuiCircularProgress-colorPrimary');
  expect(queryByText(/Skip to main content/i)).not.toBeInTheDocument();
  expect(queryByTestId('release-notes')).not.toBeInTheDocument();
  await waitFor(() => {
    expect(getByText(/Skip to main content/i)).toBeInTheDocument();
    expect(getByTestId('release-notes')).toBeInTheDocument();
  });
});

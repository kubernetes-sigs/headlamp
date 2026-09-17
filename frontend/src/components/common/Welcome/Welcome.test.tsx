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

import { fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Welcome, { WELCOME_DISMISSED_STORAGE_KEY } from './Welcome';

describe('Welcome', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/c/my-cluster/cluster');
  });

  it('introduces Headlamp and the current cluster on first use', () => {
    render(
      <BrowserRouter>
        <Welcome />
      </BrowserRouter>
    );

    expect(screen.getByText('Welcome to Headlamp')).toBeVisible();
    expect(screen.getByText('my-cluster')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Read the docs' })).toHaveAttribute(
      'href',
      'https://headlamp.dev/docs/latest/'
    );
    expect(screen.getByRole('link', { name: 'Explore Learn' })).toHaveAttribute(
      'href',
      'https://headlamp.dev/docs/latest/learn'
    );
    // The quick-start add-cluster action is always available.
    expect(screen.getByRole('button', { name: 'Add a cluster' })).toBeVisible();
  });

  it('does not show again after it is dismissed', () => {
    const { unmount } = render(
      <BrowserRouter>
        <Welcome />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    expect(localStorage.getItem(WELCOME_DISMISSED_STORAGE_KEY)).toBe('true');

    unmount();
    render(
      <BrowserRouter>
        <Welcome />
      </BrowserRouter>
    );

    expect(screen.queryByText('Welcome to Headlamp')).not.toBeInTheDocument();
  });

  it('does not show for users who already use Headlamp', () => {
    // A signal of prior usage: the user has connected to clusters before.
    localStorage.setItem('recent_clusters', JSON.stringify(['prod']));

    render(
      <BrowserRouter>
        <Welcome />
      </BrowserRouter>
    );

    expect(screen.queryByText('Welcome to Headlamp')).not.toBeInTheDocument();
    // The flag is backfilled so we skip the usage scan on later renders.
    expect(localStorage.getItem(WELCOME_DISMISSED_STORAGE_KEY)).toBe('true');
  });

  it('routes to the cluster chooser from the quick-start action', () => {
    window.history.pushState({}, '', '/advanced-search');

    render(
      <BrowserRouter>
        <Welcome />
      </BrowserRouter>
    );

    const addButton = screen.getByRole('button', { name: 'Add a cluster' });
    expect(addButton).toBeVisible();

    fireEvent.click(addButton);

    // Dismisses the welcome and routes to the in-app cluster chooser (home).
    expect(localStorage.getItem(WELCOME_DISMISSED_STORAGE_KEY)).toBe('true');
    expect(window.location.pathname).toBe('/');
  });
});

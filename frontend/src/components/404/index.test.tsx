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

import { render, screen } from '@testing-library/react';
import NotFoundComponent from '.';

vi.mock('notistack', () => ({
  useSnackbar: () => ({ enqueueSnackbar: vi.fn() }),
}));

describe('NotFoundComponent', () => {
  it('shows the default not-found content', () => {
    const { container } = render(<NotFoundComponent />);

    expect(screen.getByRole('heading', { name: `Whoops! This page doesn't exist` })).toBeVisible();
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('headlamp-404.svg')
    );
  });
});

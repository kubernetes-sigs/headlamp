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

import { composeStories, setProjectAnnotations } from '@storybook/react';
import { render as testingLibraryRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as previewAnnotations from '../../../.storybook/preview';
import * as stories from './GlobalSearchContent.stories';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  InlineIcon: () => null,
  addCollection: () => {},
}));

const annotations = setProjectAnnotations([previewAnnotations, { testingLibraryRender }]);
beforeAll(annotations.beforeAll!);

const { FoundSomeResults } = composeStories(stories);

describe('GlobalSearchContent keyboard focus', () => {
  it('lets keyboard users focus the results list without focus returning to the input', async () => {
    const user = userEvent.setup();
    await FoundSomeResults.run();

    const input = await screen.findByRole('combobox', {
      name: 'Search resources, pages, clusters by name',
    });
    const results = await screen.findByRole('group', {}, { timeout: 10000 });

    input.focus();
    for (let i = 0; i < 5 && document.activeElement !== results; i++) {
      await user.tab();
    }

    await waitFor(() => expect(document.activeElement).toBe(results));
    expect(results.tabIndex).toBe(0);
  });

  it('clears the query when the Clear button is activated with Enter', async () => {
    const user = userEvent.setup();
    await FoundSomeResults.run();

    const input = await screen.findByPlaceholderText<HTMLInputElement>(
      'Search resources, pages, clusters by name'
    );
    const clear = await screen.findByRole('button', { name: 'Clear' });
    await waitFor(() => expect(input.value).not.toBe(''));

    clear.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(input.value).toBe(''));
  });

  it('still closes the popup when Escape is pressed on the Clear button', async () => {
    const user = userEvent.setup();
    await FoundSomeResults.run();

    const input = await screen.findByRole('combobox', {
      name: 'Search resources, pages, clusters by name',
    });
    const clear = await screen.findByRole('button', { name: 'Clear' });
    await waitFor(() => expect(input.getAttribute('aria-expanded')).toBe('true'));

    clear.focus();
    await user.keyboard('{Escape}');

    await waitFor(() => expect(input.getAttribute('aria-expanded')).toBe('false'));
  });
});

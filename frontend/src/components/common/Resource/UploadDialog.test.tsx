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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../../test';
import { UploadDialog } from './UploadDialog';

const renderComponent = (setCode = vi.fn(), setUploadFiles = vi.fn()) => {
  return render(
    <TestContext>
      <UploadDialog setCode={setCode} setUploadFiles={setUploadFiles} />
    </TestContext>
  );
};

describe('UploadDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('Load from URL', () => {
    it('shows error and does not call setCode when fetch returns a non-2xx response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          statusText: 'Not Found',
          text: vi.fn().mockResolvedValue('404: Not Found'),
        })
      );

      const setCode = vi.fn();
      renderComponent(setCode);

      fireEvent.click(screen.getByRole('tab', { name: /load from url/i }));

      fireEvent.change(screen.getByLabelText(/enter url/i), {
        target: { value: 'https://example.com/nonexistent.yaml' },
      });

      fireEvent.click(screen.getByRole('button', { name: /load/i }));

      await waitFor(() => {
        expect(screen.getByText(/Failed to fetch file/i)).toBeInTheDocument();
      });

      expect(setCode).not.toHaveBeenCalled();
    });

    it('calls setCode with file content when fetch succeeds', async () => {
      const yamlContent = 'apiVersion: v1\nkind: Pod';
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          text: vi.fn().mockResolvedValue(yamlContent),
        })
      );

      const setCode = vi.fn();
      renderComponent(setCode);

      fireEvent.click(screen.getByRole('tab', { name: /load from url/i }));

      fireEvent.change(screen.getByLabelText(/enter url/i), {
        target: { value: 'https://example.com/valid.yaml' },
      });

      fireEvent.click(screen.getByRole('button', { name: /load/i }));

      await waitFor(() => {
        expect(setCode).toHaveBeenCalledWith({ format: 'yaml', code: yamlContent });
      });
    });
  });
});

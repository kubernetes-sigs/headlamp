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

import { Meta, StoryFn } from '@storybook/react';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { userEvent, waitFor } from 'storybook/test';
import { UploadDialog } from './UploadDialog';

export default {
  title: 'Resource/UploadDialog',
  component: UploadDialog,
  argTypes: {
    setUploadFiles: { action: 'setUploadFiles' },
    setCode: { action: 'setCode' },
  },
} as Meta;

const Template: StoryFn<typeof UploadDialog> = args => <UploadDialog {...args} />;

/**
 * Empty upload dialog in its default state with the Upload File tab active.
 */
export const Default = Template.bind({});

/**
 * Upload dialog with a file selected, showing the filename.
 */
export const FileSelected = Template.bind({});
FileSelected.parameters = {
  storyshots: { disable: true },
};
FileSelected.play = async () => {
  const file = new File(['apiVersion: v1\nkind: Pod'], 'test.yaml', {
    type: 'application/yaml',
  });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, file);
};

/**
 * Upload dialog after successfully loading a file.
 * The setCode and setUploadFiles actions are invoked on success.
 */
export const UploadSuccess = Template.bind({});
UploadSuccess.parameters = {
  storyshots: { disable: true },
};
UploadSuccess.play = async () => {
  const file = new File(['apiVersion: v1\nkind: Pod'], 'test.yaml', {
    type: 'application/yaml',
  });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, file);
  const loadButton = screen.getByRole('button', { name: /^Load$/i });
  await userEvent.click(loadButton);
};

/**
 * Upload dialog showing an error when all selected files are empty (file size error).
 */
export const EmptyFileError = Template.bind({});
EmptyFileError.parameters = {
  storyshots: { disable: true },
};
EmptyFileError.play = async () => {
  const emptyFile = new File([''], 'empty.yaml', { type: 'application/yaml' });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, emptyFile);
  const loadButton = screen.getByRole('button', { name: /^Load$/i });
  await userEvent.click(loadButton);
  await waitFor(() => screen.getByText(/Error: All of the files are empty/i));
};

/**
 * Upload dialog showing a validation error for an invalid URL format.
 */
export const URLValidationError = Template.bind({});
URLValidationError.parameters = {
  storyshots: { disable: true },
};
URLValidationError.play = async () => {
  const urlTab = screen.getByRole('tab', { name: /Load from URL/i });
  await userEvent.click(urlTab);
  const urlInput = await screen.findByLabelText(/Enter URL/i);
  await userEvent.type(urlInput, 'not-a-valid-url');
  const loadButton = screen.getByRole('button', { name: /^Load$/i });
  await userEvent.click(loadButton);
  await waitFor(() => screen.getByText(/Please enter a valid URL/i));
};

/**
 * Upload dialog showing a network error when fetching from a URL fails.
 */
export const URLNetworkError = Template.bind({});
URLNetworkError.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      base: null,
      story: [
        http.get('https://example.com/test.yaml', () => {
          return HttpResponse.error();
        }),
      ],
    },
  },
};
URLNetworkError.play = async () => {
  const urlTab = screen.getByRole('tab', { name: /Load from URL/i });
  await userEvent.click(urlTab);
  const urlInput = await screen.findByLabelText(/Enter URL/i);
  await userEvent.type(urlInput, 'https://example.com/test.yaml');
  const loadButton = screen.getByRole('button', { name: /^Load$/i });
  await userEvent.click(loadButton);
  await waitFor(() => screen.getByText(/Failed to fetch|Unexpected error while fetching/i));
};

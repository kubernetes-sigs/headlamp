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

import { Meta, StoryObj } from '@storybook/react';
import { screen } from '@testing-library/react';
import React from 'react';
import { expect, userEvent, waitFor } from 'storybook/test';
import { TestContext } from '../../test';
import CreateNamespaceButton from './CreateNamespaceButton';

const meta: Meta<typeof CreateNamespaceButton> = {
  title: 'Namespace/CreateNamespaceButton',
  component: CreateNamespaceButton,
  parameters: {
    storyshots: {
      disable: true,
    },
  },
  decorators: [
    Story => {
      return (
        <TestContext>
          <Story />
        </TestContext>
      );
    },
  ],
};

export default meta;

export const OkayName: StoryObj = {
  play: async () => {
    await userEvent.click(screen.getByLabelText('Create'));

    await waitFor(() => expect(screen.getByLabelText('Dialog')).toBeVisible());

    await waitFor(() => userEvent.type(screen.getByRole('textbox'), 'okay-name'), {
      timeout: 5000,
    });

    const button = await screen.findByRole('button', { name: 'Create' });

    expect(button).toBeEnabled();
  },
};

export const EmptyName: StoryObj = {
  play: async () => {
    await userEvent.click(screen.getByLabelText('Create'));

    await waitFor(() => expect(screen.getByLabelText('Dialog')).toBeVisible());

    await waitFor(() => userEvent.type(screen.getByRole('textbox'), ' '), { timeout: 5000 });

    const button = await screen.findByRole('button', { name: 'Create' });
    const errorMessage = await screen.findByText(
      "Namespaces must contain only lowercase alphanumeric characters or '-', and must start and end with an alphanumeric character."
    );

    expect(errorMessage).toBeVisible();
    expect(button).not.toBeEnabled();
  },
};

export const NotValidName: StoryObj = {
  play: async () => {
    await userEvent.click(screen.getByLabelText('Create'));

    await waitFor(() => expect(screen.getByLabelText('Dialog')).toBeVisible());

    await waitFor(() => userEvent.type(screen.getByRole('textbox'), 'not-valid-name-'), {
      timeout: 5000,
    });

    const button = await screen.findByRole('button', { name: 'Create' });
    const errorMessage = await screen.findByText(
      "Namespaces must contain only lowercase alphanumeric characters or '-', and must start and end with an alphanumeric character."
    );

    expect(errorMessage).toBeVisible();
    expect(button).not.toBeEnabled();
  },
};

export const NotValidNameLong: StoryObj = {
  play: async () => {
    const longName = 'w'.repeat(64);
    await userEvent.click(screen.getByLabelText('Create'));

    await waitFor(() => expect(screen.getByLabelText('Dialog')).toBeVisible());

    await waitFor(() => userEvent.type(screen.getByRole('textbox'), longName), { timeout: 10000 });

    const button = await screen.findByRole('button', { name: 'Create' });
    const errorMessage = await screen.findByText('Namespaces must be under 64 characters.');

    expect(errorMessage).toBeVisible();
    expect(button).not.toBeEnabled();
  },
};

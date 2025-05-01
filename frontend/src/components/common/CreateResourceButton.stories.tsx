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
import { expect, userEvent, waitFor } from '@storybook/test';
import { screen } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import { KubeObjectClass } from '../../lib/k8s/cluster';
import ConfigMap from '../../lib/k8s/configMap';
import store from '../../redux/stores/store';
import { TestContext } from '../../test';
import { CreateResourceButton, CreateResourceButtonProps } from './CreateResourceButton';

export default {
  title: 'CreateResourceButton',
  component: CreateResourceButton,
  parameters: {
    storyshots: {
      disable: true,
    },
  },
  decorators: [
    Story => {
      return (
        <Provider store={store}>
          <TestContext>
            <Story />
          </TestContext>
        </Provider>
      );
    },
  ],
} as Meta;

type Story = StoryObj<CreateResourceButtonProps>;

export const ValidResource: Story = {
  args: { resourceClass: ConfigMap as unknown as KubeObjectClass },

  play: async ({ args }) => {
    await userEvent.click(
      screen.getByRole('button', {
        name: `Create ${args.resourceClass.getBaseObject().kind}`,
      })
    );

    await waitFor(() => expect(screen.getByRole('textbox')).toBeVisible());

    await userEvent.click(screen.getByRole('textbox'));

    await userEvent.keyboard('{Control>}a{/Control} {Backspace}');
    await userEvent.keyboard(`apiVersion: v1{Enter}`);
    await userEvent.keyboard(`kind: ConfigMap{Enter}`);
    await userEvent.keyboard(`metadata:{Enter}`);
    await userEvent.keyboard(`  name: base-configmap`);

    const button = await screen.findByRole('button', { name: 'Apply' });
    expect(button).toBeVisible();
  },
};

export const InvalidResource: Story = {
  args: { resourceClass: ConfigMap as unknown as KubeObjectClass },

  play: async ({ args }) => {
    await userEvent.click(
      screen.getByRole('button', {
        name: `Create ${args.resourceClass.getBaseObject().kind}`,
      })
    );

    await waitFor(() => expect(screen.getByRole('textbox')).toBeVisible());

    await userEvent.click(screen.getByRole('textbox'));

    await userEvent.keyboard('{Control>}a{/Control}');
    await userEvent.keyboard(`apiVersion: v1{Enter}`);
    await userEvent.keyboard(`kind: ConfigMap{Enter}`);
    await userEvent.keyboard(`metadata:{Enter}`);
    await userEvent.keyboard(`  name: base-configmap{Enter}`);
    await userEvent.keyboard(`creationTimestamp: ''`);

    const button = await screen.findByRole('button', { name: 'Apply' });
    expect(button).toBeVisible();

    await userEvent.click(button);

    await waitFor(() =>
      userEvent.click(
        screen.getByRole('button', {
          name: `Create ${args.resourceClass.getBaseObject().kind}`,
        })
      )
    );

    await waitFor(() => expect(screen.getByText(/Failed/)).toBeVisible(), {
      timeout: 15000,
    });
  },
};

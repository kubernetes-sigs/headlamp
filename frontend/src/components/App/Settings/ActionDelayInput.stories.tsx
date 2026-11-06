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

import { configureStore } from '@reduxjs/toolkit';
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { Provider } from 'react-redux';
import { expect, userEvent, within } from 'storybook/test';
import i18n from '../../../i18n/config';
import configReducer, { initialState } from '../../../redux/configSlice';
import ActionDelayInput from './ActionDelayInput';

function Preview({ actionDelay }: { actionDelay: number }) {
  const { t } = useTranslation();
  const [store] = useState(() =>
    configureStore({
      reducer: { config: configReducer },
      preloadedState: {
        config: { ...initialState, settings: { ...initialState.settings, actionDelay } },
      },
    })
  );
  return (
    <I18nextProvider i18n={i18n}>
      <Provider store={store}>
        <span id="action-delay-label">{t('Action Delay')}</span>
        <ActionDelayInput nameLabelID="action-delay-label" />
      </Provider>
    </I18nextProvider>
  );
}

export default {
  title: 'Settings/ActionDelayInput',
  component: ActionDelayInput,
} as Meta<typeof ActionDelayInput>;

type Story = StoryObj<typeof ActionDelayInput>;

export const Default: Story = { render: () => <Preview actionDelay={5000} /> };
export const Immediate: Story = { render: () => <Preview actionDelay={0} /> };
export const CustomValue: Story = { render: () => <Preview actionDelay={7000} /> };

export const InvalidCustomValue: Story = {
  render: () => <Preview actionDelay={5000} />,
  parameters: {
    storyshots: {
      // Like ColorPickerValidation, this state requires play interactions.
      disable: true,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('combobox'));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole('option', {
        name: i18n.t('Custom value'),
      })
    );
    const input = await canvas.findByRole('spinbutton');
    await userEvent.clear(input);
    await userEvent.type(input, '-1');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.getByRole('button', { name: i18n.t('Apply') })).toBeDisabled();
  },
};

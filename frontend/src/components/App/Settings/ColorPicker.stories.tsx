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

import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18next';
import React, { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import ColorPicker, { PRESET_COLORS } from './ColorPicker';

i18n.init({
  lng: 'en',
  resources: {
    en: {
      translation: {},
    },
  },
});

const meta: Meta<typeof ColorPicker> = {
  title: 'App/Settings/ColorPicker',
  component: ColorPicker,
  decorators: [
    Story => (
      <I18nextProvider i18n={i18n}>
        <Story />
      </I18nextProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ColorPicker>;

const StatefulWrapper = (args: any) => {
  const [color, setColor] = useState(args.currentColor || '');
  const [, setError] = useState('');

  return (
    <ColorPicker
      {...args}
      currentColor={color}
      onSelectColor={(newColor: string) => {
        console.log('Selected color:', newColor);
        setColor(newColor);
      }}
      onError={(err: string) => {
        console.log('Error:', err);
        setError(err);
      }}
    />
  );
};

export const Default: Story = {
  render: args => <StatefulWrapper {...args} />,
  args: {
    open: true,
    currentColor: '',
    onClose: () => console.log('Dialog closed'),
  },
};

export const PresetSelected: Story = {
  render: args => <StatefulWrapper {...args} />,
  args: {
    open: true,
    currentColor: PRESET_COLORS[5].value,
    onClose: () => console.log('Dialog closed'),
  },
};

export const CustomColorMode: Story = {
  render: args => <StatefulWrapper {...args} />,
  args: {
    open: true,
    currentColor: '',
    onClose: () => console.log('Dialog closed'),
  },
  play: async ({ canvasElement }) => {
    const checkbox = canvasElement.querySelector('input[type="checkbox"]') as HTMLInputElement;

    if (checkbox) {
      checkbox.click();
    }
  },
};

export const InvalidCustomColor: Story = {
  render: args => <StatefulWrapper {...args} />,
  args: {
    open: true,
    currentColor: '',
    onClose: () => console.log('Dialog closed'),
  },
  play: async ({ canvasElement }) => {
    const checkbox = canvasElement.querySelector('input[type="checkbox"]') as HTMLInputElement;

    if (checkbox) checkbox.click();

    const input = canvasElement.querySelector('input[placeholder="#ff0000"]') as HTMLInputElement;

    if (input) {
      input.value = 'invalid-color';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  },
};

export const ValidCustomColor: Story = {
  render: args => <StatefulWrapper {...args} />,
  args: {
    open: true,
    currentColor: '',
    onClose: () => console.log('Dialog closed'),
  },
  play: async ({ canvasElement }) => {
    const checkbox = canvasElement.querySelector('input[type="checkbox"]') as HTMLInputElement;

    if (checkbox) checkbox.click();

    const input = canvasElement.querySelector('input[placeholder="#ff0000"]') as HTMLInputElement;

    if (input) {
      input.value = '#123456';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  },
};

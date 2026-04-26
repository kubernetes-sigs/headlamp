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
import React, { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../i18n/config';
import ColorPicker, { PRESET_COLORS } from './ColorPicker';

const meta: Meta<typeof ColorPicker> = {
  title: 'Settings/ColorPicker',
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

const StatefulWrapper = (args: React.ComponentProps<typeof ColorPicker>) => {
  const [color, setColor] = useState(args.currentColor || '');
  const [, setError] = useState('');

  return (
    <ColorPicker
      {...args}
      currentColor={color}
      onSelectColor={(newColor: string) => setColor(newColor)}
      onError={(err: string) => setError(err)}
    />
  );
};

export const Default: Story = {
  render: args => <StatefulWrapper {...args} />,
  args: {
    open: true,
    currentColor: '',
    onClose: () => {},
  },
};

export const PresetSelected: Story = {
  render: args => <StatefulWrapper {...args} />,
  args: {
    open: true,
    currentColor: PRESET_COLORS[5].value,
    onClose: () => {},
  },
};

export const CustomModeInitial: Story = {
  render: args => <StatefulWrapper {...args} />,
  args: {
    open: true,
    currentColor: '',
    onClose: () => {},
  },
};

export const CustomInvalidInitial: Story = {
  render: args => <StatefulWrapper {...args} />,
  args: {
    open: true,
    currentColor: '',
    onClose: () => {},
  },
};

export const CustomValidInitial: Story = {
  render: args => <StatefulWrapper {...args} />,
  args: {
    open: true,
    currentColor: '',
    onClose: () => {},
  },
};

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
import IconPicker, { PRESET_ICONS } from './IconPicker';

const meta: Meta<typeof IconPicker> = {
  title: 'App/Settings/IconPicker',
  component: IconPicker,
};

export default meta;

type Story = StoryObj<typeof IconPicker>;

export const DefaultOpen: Story = {
  args: {
    open: true,
    currentIcon: '',
    onClose: () => {},
    onSelectIcon: () => {},
  },
};

export const SelectedPresetIcon: Story = {
  args: {
    open: true,
    currentIcon: PRESET_ICONS[0].value,
    onClose: () => {},
    onSelectIcon: () => {},
  },
};

export const CustomIconModeEnabled: Story = {
  args: {
    open: true,
    // Use a value NOT in presets to simulate custom mode
    currentIcon: 'mdi:custom-icon',
    onClose: () => {},
    onSelectIcon: () => {},
  },
};

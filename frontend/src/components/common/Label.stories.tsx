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
import React from 'react';
import {
  DateLabel,
  DateLabelProps,
  HeaderLabel,
  HeaderLabelProps,
  HoverInfoLabel,
  HoverInfoLabelProps,
  InfoLabel,
  InfoLabelProps,
  NameLabel,
  StatusLabel,
  StatusLabelProps,
  ValueLabel,
} from './Label';

export default {
  title: 'Label',
} as Meta;

// --- DateLabel ---
const DateLabelTemplate: StoryFn<DateLabelProps> = args => <DateLabel {...args} />;
const fixedDate = new Date('2021-01-01T00:00:00Z');

export const DateLabelDefault = DateLabelTemplate.bind({});
DateLabelDefault.args = {
  date: fixedDate,
};

export const DateLabelMini = DateLabelTemplate.bind({});
DateLabelMini.args = {
  date: fixedDate,
  format: 'mini',
};

// --- HeaderLabel ---
const HeaderLabelTemplate: StoryFn<HeaderLabelProps> = args => <HeaderLabel {...args} />;

export const HeaderLabelDefault = HeaderLabelTemplate.bind({});
HeaderLabelDefault.args = {
  value: 'value',
  label: 'name',
};

export const HeaderLabelToolTip = HeaderLabelTemplate.bind({});
HeaderLabelToolTip.args = {
  value: 'value',
  label: 'name',
  tooltip: 'tooltip',
};

// --- HoverInfoLabel ---
const HoverInfoLabelTemplate: StoryFn<HoverInfoLabelProps> = args => <HoverInfoLabel {...args} />;

export const HoverInfoLabelDefault = HoverInfoLabelTemplate.bind({});
HoverInfoLabelDefault.args = {
  label: 'Some label',
  hoverInfo: 'hover info',
};

export const HoverInfoLabelInfo = HoverInfoLabelTemplate.bind({});
HoverInfoLabelInfo.args = {
  label: 'Some label',
  hoverInfo: <div>hover info div</div>,
};

export const HoverInfoLabelPropsStory = HoverInfoLabelTemplate.bind({});
HoverInfoLabelPropsStory.args = {
  label: 'Some label',
  hoverInfo: <div>hover info div</div>,
  labelProps: {
    variant: 'body2',
  },
};

export const HoverInfoLabelIconPosition = HoverInfoLabelTemplate.bind({});
HoverInfoLabelIconPosition.args = {
  label: 'Some label',
  hoverInfo: <div>hover info div</div>,
  iconPosition: 'start',
};

export const HoverInfoLabelWithoutIcon = HoverInfoLabelTemplate.bind({});
HoverInfoLabelWithoutIcon.args = {
  label: 'Some label',
};

// --- InfoLabel ---
const InfoLabelTemplate: StoryFn<InfoLabelProps> = args => <InfoLabel {...args} />;

export const InfoLabelDefault = InfoLabelTemplate.bind({});
InfoLabelDefault.args = {
  name: 'name',
  value: 'value',
};

// --- NameLabel ---
const NameLabelTemplate: StoryFn<{}> = args => <NameLabel {...args}>A name label</NameLabel>;

export const NameLabelDefault = NameLabelTemplate.bind({});

// --- StatusLabel ---
const StatusLabelTemplate: StoryFn<StatusLabelProps> = args => (
  <StatusLabel {...args}>{args.status}</StatusLabel>
);

export const StatusLabelSuccess = StatusLabelTemplate.bind({});
StatusLabelSuccess.args = {
  status: 'success',
};

export const StatusLabelWarning = StatusLabelTemplate.bind({});
StatusLabelWarning.args = {
  status: 'warning',
};

export const StatusLabelError = StatusLabelTemplate.bind({});
StatusLabelError.args = {
  status: 'error',
};

// --- ValueLabel ---
const ValueLabelTemplate: StoryFn<{}> = args => (
  <ValueLabel {...args}>A ValueLabel is here</ValueLabel>
);

export const ValueLabelDefault = ValueLabelTemplate.bind({});

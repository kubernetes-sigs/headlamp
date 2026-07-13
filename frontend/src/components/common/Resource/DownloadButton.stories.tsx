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

import '../../../i18n/config';
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { Provider } from 'react-redux';
import { KubeObject } from '../../../lib/k8s/cluster';
import store from '../../../redux/stores/store';
import DownloadButton from './DownloadButton';
import { DownloadButtonProps } from './DownloadButton';

export default {
  title: 'Resource/DownloadButton',
  component: DownloadButton,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <Provider store={store}>
          <Story />
        </Provider>
      );
    },
  ],
} as Meta;

const Template: StoryFn<DownloadButtonProps> = args => <DownloadButton {...args} />;

const defaultItem = {
  metadata: {
    uid: '123',
    name: 'example-resource',
  },
  jsonData: {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: 'example-resource',
      namespace: 'default',
    },
    data: {
      key: 'value',
    },
  },
  getName: function () {
    return this.metadata?.name ?? '';
  },
} as KubeObject;

export const Default = Template.bind({});
Default.args = {
  item: defaultItem,
};

export const MenuStyle = Template.bind({});
MenuStyle.args = {
  item: defaultItem,
  buttonStyle: 'menu',
};

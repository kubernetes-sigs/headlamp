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
  PureNamespacesAutocomplete,
  PureNamespacesAutocompleteProps,
} from './NamespacesAutocomplete';

export default {
  title: 'NamespacesAutocomplete',
  component: PureNamespacesAutocomplete,
  decorators: [Story => <Story />],
} as Meta;

const Template: StoryFn<PureNamespacesAutocompleteProps> = args => {
  const [filter, setFilter] = React.useState<{ namespaces: Set<string>; search: string }>({
    namespaces: new Set([]),
    search: '',
  });
  const namespaceNames = React.useState<string[]>(['default', 'kube-system', 'kube-public'])[0];

  const onChange = (event: React.ChangeEvent<{}>, newValue: string[]) => {
    setFilter({
      namespaces: new Set(newValue),
      search: '',
    });
  };

  return (
    <PureNamespacesAutocomplete
      {...args}
      namespaceNames={namespaceNames}
      onChange={onChange}
      filter={filter}
    />
  );
};

export const Some = Template.bind({});
Some.args = {};

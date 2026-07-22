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
import A8RInfo from './A8RInfo';

export default {
  title: 'Resource/A8RInfo',
  component: A8RInfo,
  argTypes: {},
} as Meta;

const Template: StoryFn<typeof A8RInfo> = args => <A8RInfo {...args} />;

export const WithAllMetadata = Template.bind({});
WithAllMetadata.args = {
  annotations: {
    'a8r.io/owner': 'team-awesome',
    'a8r.io/description': 'A service that does awesome things',
    'a8r.io/chat': 'https://chat.example.com/awesome',
    'a8r.io/bugs': 'https://bugs.example.com/awesome',
  },
};

export const WithDescriptionOnly = Template.bind({});
WithDescriptionOnly.args = {
  annotations: {
    'a8r.io/description': 'A minimal service',
  },
};

export const Empty = Template.bind({});
Empty.args = {
  annotations: {},
};

export const WithLinks = Template.bind({});
WithLinks.args = {
  annotations: {
    'a8r.io/owner': 'sre-team',
    'a8r.io/repository': 'https://github.com/example/my-service',
    'a8r.io/documentation': 'https://docs.example.com/my-service',
    'a8r.io/support': 'https://support.example.com',
  },
};

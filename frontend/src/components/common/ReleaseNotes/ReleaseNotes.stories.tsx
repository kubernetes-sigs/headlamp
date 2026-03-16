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
import { http, HttpResponse } from 'msw';
import ReleaseNotes from './ReleaseNotes';

const withEnv = (Story: React.ComponentType) => {
  localStorage.setItem('app_version', '1.8.0'); // lets notes show for 1.9.9
  localStorage.setItem('disable_update_check', 'false');
  (window as any).desktopApi = {
    receive: (_: string, cb: (cfg: any) => void) =>
      cb({ appVersion: '1.9.9', checkForUpdates: true }),
    send: () => {},
  };
  return <Story />;
};

export default {
  title: 'common/ReleaseNotes/ReleaseNotes',
  component: ReleaseNotes,
  decorators: [withEnv],
  parameters: {
    msw: {
      handlers: [
        http.get('https://api.github.com/repos/kinvolk/headlamp/releases', () =>
          HttpResponse.json([
            { name: 'v2.0.0', html_url: 'https://example.com/v2', body: 'big release' },
            { name: 'headlamp-plugin-example', html_url: '#', body: '' },
          ])
        ),
        http.get('https://api.github.com/repos/kinvolk/headlamp/releases/tags/v1.9.9', () =>
          HttpResponse.json({
            body: '### Hello\n\nworld',
          })
        ),
      ],
    },
  },
} as Meta;

const Template: StoryFn = () => <ReleaseNotes />;

export const Default = Template.bind({});

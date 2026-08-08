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
import { useEffect, useRef } from 'react';
import { TestContext } from '../../../test';
import SettingsButton from './SettingsButton';

// SettingsButton reads the active cluster from window.location (getCluster) in
// render and renders nothing when there is none. Point the URL at a cluster
// before the child renders, restoring it on unmount so other stories are
// unaffected. The ref guard captures the real previous path exactly once, so a
// double render (StrictMode) doesn't record the mocked path as the original.
function WithCluster({ children }: { children: React.ReactNode }) {
  const previous = useRef<string | undefined>(undefined);
  if (previous.current === undefined) {
    previous.current = window.location.pathname;
    window.history.replaceState({}, '', '/c/mock-cluster/settings');
  }
  useEffect(
    () => () => {
      if (previous.current !== undefined) {
        window.history.replaceState({}, '', previous.current);
      }
    },
    []
  );
  return <>{children}</>;
}

export default {
  title: 'Settings/SettingsButton',
  component: SettingsButton,
  decorators: [
    Story => (
      <TestContext>
        <WithCluster>
          <Story />
        </WithCluster>
      </TestContext>
    ),
  ],
} as Meta<typeof SettingsButton>;

const Template: StoryFn<typeof SettingsButton> = args => <SettingsButton {...args} />;

export const Default = Template.bind({});

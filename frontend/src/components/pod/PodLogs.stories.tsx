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
import { getTestDate } from '../../helpers/testHelpers';
import { StreamResultsCb } from '../../lib/k8s/apiProxy';
import { LogOptions } from '../../lib/k8s/pod';
import { TestContext } from '../../test';
import { PodLogViewer } from './Details';

export default {
  title: 'Pod/PodLogViewer',
  component: PodLogViewer,
  argTypes: {},
  parameters: {
    storyshots: {
      disable: true,
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return (
    <TestContext routerMap={{ namespace: 'default', name: 'pod-name' }}>
      <PodLogViewer
        open
        onClose={() => {}}
        item={
          {
            spec: {
              containers: [{ name: 'container-name' } as any],
            },
            getName() {
              return 'pod-name';
            },
            getLogs,
          } as any
        }
      />
    </TestContext>
  );
};

function getLogs(container: string, onLogs: StreamResultsCb, logsOptions: LogOptions) {
  const { tailLines, showTimestamps } = logsOptions;

  function generateLogs() {
    const linesToShow = tailLines || 100;
    const logs: string[] = [];

    for (let i = 0; i < linesToShow; i++) {
      logs.push(
        `${
          showTimestamps ? getTestDate().toISOString() + ' ' : ''
        }(log #${i}): from container ${container} log line log line log line log line log line log line log line log line log line\n`
      );
    }

    return logs;
  }

  onLogs(generateLogs());
}

export const Logs = Template.bind({});

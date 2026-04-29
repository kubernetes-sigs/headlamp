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

import { Box } from '@mui/material';
import { Meta, StoryFn } from '@storybook/react';
import { TestContext } from '../../../test';
import { LogDisplay } from './LogDisplay';
import type { ParsedLog } from './ParsedLog';

type Args = React.ComponentProps<typeof LogDisplay>;

export default {
  title: 'common/LogsViewer/LogDisplay',
  component: LogDisplay,
  decorators: [
    Story => (
      <TestContext>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '60vh',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Story />
        </Box>
      </TestContext>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
} as Meta<typeof LogDisplay>;

const Template: StoryFn<Args> = args => <LogDisplay {...args} />;

const baseLogs: ParsedLog[] = [
  {
    timestamp: '2024-01-01T12:00:00.001Z',
    severity: 'info',
    content: 'Starting application server on port 8080',
  },
  {
    timestamp: '2024-01-01T12:00:00.250Z',
    severity: 'info',
    content: 'Connected to database in 240ms',
  },
  {
    timestamp: '2024-01-01T12:00:01.000Z',
    severity: 'debug',
    content: 'Loaded configuration from /etc/app/config.yaml',
  },
  {
    timestamp: '2024-01-01T12:00:02.000Z',
    severity: 'warning',
    content: 'Cache miss for key user:42, falling back to origin',
  },
  {
    timestamp: '2024-01-01T12:00:03.000Z',
    severity: 'error',
    content: 'Failed to acquire lease: context deadline exceeded',
  },
  {
    timestamp: '2024-01-01T12:00:04.000Z',
    severity: 'info',
    content: 'Request handled GET /healthz 200 in 3ms',
  },
  {
    timestamp: '2024-01-01T12:00:05.000Z',
    severity: 'fatal',
    content: 'Unrecoverable error, shutting down',
  },
  {
    timestamp: '2024-01-01T12:00:06.000Z',
    severity: 'trace',
    content: 'gc pause 1.2ms',
  },
];

/** Default rendering, no metadata columns. */
export const Default = Template.bind({});
Default.args = {
  logs: baseLogs,
};

/** Show timestamp and severity columns alongside log content. */
export const WithSeverityAndTimestamps = Template.bind({});
WithSeverityAndTimestamps.args = {
  logs: baseLogs,
  showTimestamps: true,
  showSeverity: true,
  textWrap: true,
};

/** Logs aggregated from multiple pods, pod names get a deterministic color. */
export const WithPodNames = Template.bind({});
WithPodNames.args = {
  logs: baseLogs.map((log, i) => ({
    ...log,
    pod: `worker-${(i % 3) + 1}`,
  })),
  showTimestamps: true,
  showSeverity: true,
  textWrap: true,
};

/** Long lines wrap to fit the container width. */
export const TextWrapped = Template.bind({});
TextWrapped.args = {
  logs: [
    {
      timestamp: '2024-01-01T12:00:00.000Z',
      severity: 'info',
      content:
        'This is a very long log line that should wrap when text wrap is enabled. ' +
        'It contains a lot of repeated text so we can clearly see the wrapping behavior. '.repeat(
          6
        ),
    },
    ...baseLogs,
  ],
  textWrap: true,
  showTimestamps: true,
};

/** Logs with ANSI escape codes are rendered with proper colors. */
export const AnsiColors = Template.bind({});
AnsiColors.args = {
  logs: [
    {
      timestamp: '2024-01-01T12:00:00.000Z',
      severity: 'info',
      content: '\u001b[32m[OK]\u001b[0m server started',
    },
    {
      timestamp: '2024-01-01T12:00:01.000Z',
      severity: 'warning',
      content: '\u001b[33m[WARN]\u001b[0m disk usage at 85%',
    },
    {
      timestamp: '2024-01-01T12:00:02.000Z',
      severity: 'error',
      content: '\u001b[1;31m[ERR]\u001b[0m failed to write to /var/log/app.log',
    },
  ],
  showTimestamps: true,
  showSeverity: true,
};

/** Filter only error and fatal entries. */
export const SeverityFiltered = Template.bind({});
SeverityFiltered.args = {
  logs: baseLogs,
  severityFilter: new Set(['error', 'fatal']),
  showSeverity: true,
  showTimestamps: true,
};

/** A larger volume of logs to exercise the virtualized list. */
export const ManyLines = Template.bind({});
ManyLines.args = {
  logs: Array.from({ length: 500 }, (_, i) => ({
    timestamp: new Date(
      Date.UTC(2024, 0, 1, 12, 0, Math.floor(i / 10), (i * 17) % 1000)
    ).toISOString(),
    severity: (['info', 'debug', 'warning', 'error'] as const)[i % 4],
    content: `Line ${i + 1}: processed event id=${1000 + i} status=ok latency=${(i * 3) % 200}ms`,
  })),
  showTimestamps: true,
  showSeverity: true,
};

/** Empty log list. */
export const EmptyLogs = Template.bind({});
EmptyLogs.args = {
  logs: [],
};

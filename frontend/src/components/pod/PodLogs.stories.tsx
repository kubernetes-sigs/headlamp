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
  argTypes: {
    open: {
      control: 'boolean',
      description: 'Whether the log viewer is open',
      defaultValue: true,
    },
    showTimestamps: {
      control: 'boolean',
      description: 'Show timestamps in logs',
      defaultValue: true,
    },
    prettifyLogs: {
      control: 'boolean',
      description: 'Prettify JSON logs',
      defaultValue: false,
    },
    formatJsonValues: {
      control: 'boolean',
      description: 'Format JSON values by unescaping string literals',
      defaultValue: false,
    },
  },
} as Meta;

interface PodLogViewerStoryProps {
  open: boolean;
  showTimestamps: boolean;
  prettifyLogs: boolean;
  formatJsonValues: boolean;
  logType: 'plain' | 'json' | 'bigJson' | 'formatting';
}

const Template: StoryFn<PodLogViewerStoryProps> = args => {
  const { logType, ...restArgs } = args;
  return (
    <TestContext routerMap={{ namespace: 'default', name: 'pod-name' }}>
      <PodLogViewer
        {...restArgs}
        onClose={() => {}}
        item={
          {
            spec: {
              containers: [{ name: 'main-container' }, { name: 'sidecar-container' }],
              initContainers: [{ name: 'init-container' }],
            },
            getName() {
              return 'pod-name';
            },
            getLogs: (container: string, onLogs: StreamResultsCb, logsOptions: LogOptions) =>
              getLogs(container, onLogs, logsOptions, logType),
          } as any
        }
      />
    </TestContext>
  );
};

function getLogs(
  container: string,
  onLogs: StreamResultsCb,
  logsOptions: LogOptions,
  logType: 'plain' | 'json' | 'bigJson' | 'formatting'
) {
  const { tailLines = 100, showTimestamps, prettifyLogs, formatJsonValues } = logsOptions;
  const testDate = getTestDate();
  const logs: string[] = [];
  let hasJsonLogs = false;

  const linesToShow = tailLines === -1 ? 100 : tailLines;

  const generatePlainLog = (index: number) => {
    return `${
      showTimestamps ? testDate.toISOString() + ' ' : ''
    }[INFO] Log entry #${index} from ${container}: Application processing request\n`;
  };

  const generateJsonLog = (index: number) => {
    const jsonData = {
      level: 'info',
      message: `Processing request #${index} from ${container}`,
      requestId: `req-${index}`,
      timestamp: testDate.toISOString(),
      details: {
        user: `user-${index}`,
        endpoint: `/api/v1/resource/${index}`,
        status: index % 2 === 0 ? 'success' : 'error',
      },
    };
    hasJsonLogs = true;
    return `${showTimestamps ? testDate.toISOString() + ' ' : ''}${JSON.stringify(jsonData)}`;
  };

  const generateBigJsonLog = (index: number) => {
    const jsonData = {
      level: 'debug',
      message: `Complex operation #${index} from ${container}`,
      timestamp: testDate.toISOString(),
      metadata: {
        requestId: `req-${index}`,
        traceId: `trace-${index}`,
        spanId: `span-${index}`,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124',
        clientIp: `192.168.1.${index % 255}`,
        duration: `500.0ms`,
      },
      context: {
        service: {
          name: container,
          version: '1.0.0',
          environment: 'production',
        },
        request: {
          method: 'POST',
          path: `/api/v2/complex/${index}`,
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer token123',
          },
        },
        response: {
          status: index % 2 === 0 ? 200 : 500,
          body: index % 2 === 0 ? 'Success' : 'Internal Server Error',
        },
      },
      logs: Array(5)
        .fill(null)
        .map((_, i) => ({
          event: `sub-event-${i}`,
          timestamp: new Date(testDate.getTime() + i * 1000).toISOString(),
          data: `Additional data point ${i}`,
        })),
    };
    hasJsonLogs = true;
    return `${showTimestamps ? testDate.toISOString() + ' ' : ''}${JSON.stringify(jsonData)}`;
  };

  const generateFormattingLog = () => {
    const comprehensiveLog = {
      level: 'verbose',
      timestamp: testDate.toISOString(),
      message: 'This log demonstrates all formatting capabilities',
      escapedValues: {
        newlines: 'First line\\nSecond line\\nThird line',
        tabs: 'Column1\\tColumn2',
        quotes: 'He said \\"Hello world!\\"',
        backslashes: 'Path: C:\\\\Program Files\\\\App',
        combined: 'Line1\\n\\tIndented\\nLine2\\"quoted\\"\\nPath: C:\\\\Windows',
      },
      nested: {
        level1: {
          level2: {
            level3: {
              value: 'Deeply nested value',
              array: [1, 2, 3, { nestedInArray: true }],
            },
          },
        },
      },
      specialChars: '✓ ✔ ✕ ✖ ✗ ✘ ♥ ❤ ❥ ❣ ❦ ❧ ☜ ☞ ☝ ☚ ☛ ☟ ✍ ✎ ✏ ✐ ✑ ✒',
      unicode: '日本語 Español Français Deutsch Русский 中文',
      largeArray: Array(20)
        .fill(null)
        .map((_, i) => ({
          id: i,
          name: `Item ${i}`,
          active: i % 2 === 0,
          nested: {
            value: i * 100,
          },
        })),
    };
    hasJsonLogs = true;
    return `${showTimestamps ? testDate.toISOString() + ' ' : ''}${JSON.stringify(
      comprehensiveLog
    )}`;
  };

  // Generate logs based on the specified type
  for (let i = 0; i < linesToShow; i++) {
    switch (logType) {
      case 'plain':
        logs.push(generatePlainLog(i));
        break;
      case 'json':
        logs.push(generateJsonLog(i));
        break;
      case 'bigJson':
        logs.push(generateBigJsonLog(i));
        break;
      case 'formatting':
        logs.push(generateFormattingLog());
        break;
      default:
        // For mixed cases (not used in these stories)
        if (i % 5 === 0) {
          logs.push(generateBigJsonLog(i));
        } else if (i % 2 === 0) {
          logs.push(generateJsonLog(i));
        } else {
          logs.push(generatePlainLog(i));
        }
    }
  }

  const processedLogs = logs.map(log => {
    if (prettifyLogs && hasJsonLogs) {
      try {
        const jsonMatch = log.match(/(\{.*\})/);
        if (!jsonMatch) return log;

        const jsonStr = jsonMatch[1];
        const jsonObj = JSON.parse(jsonStr);

        const valueReplacer = formatJsonValues
          ? (key: string, value: any) =>
              typeof value === 'string' ? unescapeStringLiterals(value) : value
          : undefined;

        const prettyJson = JSON.stringify(jsonObj, valueReplacer, 2);
        const terminalReadyJson = formatJsonValues
          ? unescapeStringLiterals(prettyJson)
          : prettyJson;

        if (showTimestamps) {
          const timestamp = log.slice(0, jsonMatch.index).trim();
          return timestamp ? `${timestamp}\n${terminalReadyJson}\n` : `${terminalReadyJson}\n`;
        } else {
          return `${terminalReadyJson}\n`;
        }
      } catch {
        return log;
      }
    }
    return log;
  });

  onLogs({ logs: processedLogs, hasJsonLogs });
}

function unescapeStringLiterals(str: string): string {
  return str
    .replace(/\\\\/g, '\\')
    .replace(/\\r\\n/g, '\r\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
}

export const PlainLogs = Template.bind({});
PlainLogs.args = {
  open: true,
  showTimestamps: true,
  prettifyLogs: false,
  formatJsonValues: false,
  logType: 'plain',
};

export const JsonLogs = Template.bind({});
JsonLogs.args = {
  open: true,
  showTimestamps: true,
  prettifyLogs: false,
  formatJsonValues: false,
  logType: 'json',
};

export const FormattedJsonLogs = Template.bind({});
FormattedJsonLogs.args = {
  open: true,
  showTimestamps: true,
  prettifyLogs: true,
  formatJsonValues: true,
  logType: 'json',
};

export const BigJsonLogs = Template.bind({});
BigJsonLogs.args = {
  open: true,
  showTimestamps: true,
  prettifyLogs: true,
  formatJsonValues: true,
  logType: 'bigJson',
};

export const FormattingLogs = Template.bind({});
FormattingLogs.args = {
  open: true,
  showTimestamps: true,
  prettifyLogs: true,
  formatJsonValues: true,
  logType: 'formatting',
};

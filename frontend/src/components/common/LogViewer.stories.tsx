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

import { FormControl, InputLabel, MenuItem, Select } from '@mui/material';
import { action } from '@storybook/addon-actions';
import { Meta, StoryFn } from '@storybook/react';
import { useCallback, useEffect, useState } from 'react';
import { getTestDate } from '../../helpers/testHelpers';
import { LogViewer, LogViewerProps } from './LogViewer';

export default {
  title: 'LogViewer',
  component: LogViewer,
  argTypes: {
    onClose: { action: 'closed' },
  },
  parameters: {
    storyshots: {
      disable: true,
    },
  },
} as Meta;

const Template: StoryFn<LogViewerProps> = args => <LogViewer {...args} />;

export const BasicLogs = Template.bind({});
BasicLogs.args = {
  logs: ['first log entry\n', 'second log entry\n', 'third log entry\n', 'end of log stream'],
  title: 'Basic Logs',
  downloadName: 'basic-logs',
  open: true,
};
BasicLogs.parameters = {
  docs: {
    description: {
      story: 'LogViewer displaying simple text logs.',
    },
  },
};

export const ColoredLogs = Template.bind({});
ColoredLogs.args = {
  logs: [
    '\x1b[32mINFO\x1b[0m: Application started\n',
    '\x1b[33mWARN\x1b[0m: High memory usage detected\n',
    '\x1b[31mERROR\x1b[0m: Failed to connect to database\n',
    '\x1b[36mDEBUG\x1b[0m: Connection attempt details...\n',
  ],
  title: 'Colored Logs',
  downloadName: 'colored-logs',
  open: true,
};
ColoredLogs.parameters = {
  docs: {
    description: {
      story: 'LogViewer displaying logs with ANSI color codes for different log levels.',
    },
  },
};

export const LogOverflow = Template.bind({});
LogOverflow.args = {
  logs: Array.from(
    { length: 1000 },
    (_, i) =>
      `[${new Date('2024-01-23').toISOString()}] (log #${
        i + 1
      }): from container 'database' log line log line log line log line log line log line log line log line log line\n`
  ),
  title: 'Log Overflow To Test Scrolling Behaviour Performance',
  downloadName: 'log-overflow',
  open: true,
};
LogOverflow.parameters = {
  docs: {
    description: {
      story:
        'LogViewer handling a large number of log entries to test scrolling behavior performance.',
    },
  },
};

export const LiveUpdatingLogs = () => {
  const [logs, setLogs] = useState<string[]>(['Starting log stream\n']);
  const [counter, setCounter] = useState<number>(1);

  useEffect(() => {
    const interval = setInterval(() => {
      const timestamp = getTestDate().toISOString();
      setLogs(prevLogs => [...prevLogs, `[${timestamp}] New log entry: #${counter}\n`]);
      setCounter(prevCounter => prevCounter + 1);
    }, 500);

    return () => clearInterval(interval);
  }, [counter]);

  return (
    <LogViewer
      open
      logs={logs}
      title="Live Updating Logs"
      downloadName="live-updating-logs"
      onClose={action('closed')}
    />
  );
};
LiveUpdatingLogs.parameters = {
  docs: {
    description: {
      story: 'LogViewer demonstrating live-updating logs with timestamps.',
    },
  },
};

const containerLogs: Record<string, string[]> = {
  'web-server': [
    '[web-server] Server starting on port 3000\n',
    '[web-server] Connected to database\n',
    '[web-server] Handling incoming request\n',
  ],
  database: [
    '[database] PostgreSQL database initialized\n',
    '[database] Running migrations\n',
    '[database] Creating initial tables\n',
  ],
  cache: [
    '[cache] Redis cache started\n',
    '[cache] Cache warm-up complete\n',
    '[cache] Processing cache invalidation\n',
  ],
};
const ContainerSelector = ({
  selectedContainer,
  onContainerChange,
}: {
  selectedContainer: string;
  onContainerChange: (container: string) => void;
}) => {
  return (
    <FormControl sx={{ minWidth: '11rem' }}>
      <InputLabel shrink id="container-select-label">
        Container
      </InputLabel>
      <Select
        labelId="container-select-label"
        value={selectedContainer}
        onChange={e => onContainerChange(e.target.value)}
      >
        {Object.keys(containerLogs).map(container => (
          <MenuItem key={container} value={container}>
            {container}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};
export const TopActions = () => {
  const [selectedContainer, setSelectedContainer] = useState<string>('web-server');
  const [logs, setLogs] = useState<string[]>(containerLogs['web-server']);

  const handleContainerChange = (container: string) => {
    setSelectedContainer(container);
    setLogs(containerLogs[container]);
    action('container-changed')(container);
  };

  return (
    <LogViewer
      open
      logs={logs}
      title="Top Actions"
      downloadName={`${selectedContainer}-logs`}
      onClose={action('closed')}
      topActions={[
        <ContainerSelector
          key="container-selector"
          selectedContainer={selectedContainer}
          onContainerChange={handleContainerChange}
        />,
      ]}
    />
  );
};
TopActions.parameters = {
  docs: {
    description: {
      story: 'LogViewer displaying custom top actions.',
    },
  },
};

const initialLogs = ['[system] Connection established\n', '[system] Starting log stream\n'];
type ConnectionState = 'connected' | 'disconnected' | 'connecting';
export const ReconnectToSeeLogs = () => {
  const [logs, setLogs] = useState<string[]>(initialLogs);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connected');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  useEffect(() => {
    if (connectionState !== 'connected') return;

    const logInterval = setInterval(() => {
      setLogs(prevLogs => [
        ...prevLogs.slice(-99), // keep last 100 logs
        `[app] Log entry at ${getTestDate().toISOString()}\n`,
      ]);
    }, 1500);

    return () => clearInterval(logInterval);
  }, [connectionState]);

  useEffect(() => {
    if (connectionState !== 'connected') return;

    const disconnectTimeout = setTimeout(() => {
      if (connectionState === 'connected') {
        setConnectionState('disconnected');
        setLogs(prevLogs => [
          ...prevLogs,
          '[system] Connection lost. Click reconnect to try again.\n',
        ]);
      }
    }, 5000); // disconnect after 5 seconds

    return () => clearTimeout(disconnectTimeout);
  }, [connectionState]);

  const handleReconnect = useCallback(() => {
    setConnectionState('connecting');
    setLogs(prev => [...prev, '[system] Attempting to reconnect...\n']);

    setReconnectAttempt(prev => prev + 1);

    setTimeout(() => {
      const success = Math.random() > 0.5; // 50% chance of success
      setConnectionState(success ? 'connected' : 'disconnected');

      setLogs(prevLogs => [
        ...prevLogs.slice(-99), // keep last 100 logs
        success
          ? '[system] Successfully reconnected!\n[system] Resuming log stream\n'
          : `[system] Reconnection attempt ${
              reconnectAttempt + 1
            } failed.\n[system] Please try again.\n`,
      ]);
    }, 2000); // network delay
  }, [reconnectAttempt]);

  return (
    <LogViewer
      open
      logs={logs}
      title={`Log Viewer (${
        connectionState === 'connecting'
          ? 'connecting...'
          : connectionState === 'connected'
          ? 'connected!'
          : 'disconnected :('
      })`}
      downloadName="reconnect-to-see-logs"
      onClose={action('closed')}
      showReconnectButton={connectionState === 'disconnected'}
      handleReconnect={handleReconnect}
    />
  );
};
ReconnectToSeeLogs.parameters = {
  storyshots: {
    disable: true,
  },
  docs: {
    description: {
      story: 'LogViewer simulating recovery of connection loss upon clicking on reconnect button.',
    },
  },
};

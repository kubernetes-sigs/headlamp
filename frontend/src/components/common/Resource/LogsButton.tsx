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

import { Icon } from '@iconify/react';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { styled } from '@mui/material/styles';
import Switch from '@mui/material/Switch';
import { Terminal as XTerminal } from '@xterm/xterm';
import { useSnackbar } from 'notistack';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { labelSelectorToQuery } from '../../../lib/k8s';
import { clusterFetch } from '../../../lib/k8s/api/v2/fetch';
import { makeUrl } from '../../../lib/k8s/api/v2/makeUrl';
import { KubeContainerStatus } from '../../../lib/k8s/cluster';
import DaemonSet from '../../../lib/k8s/daemonSet';
import Deployment from '../../../lib/k8s/deployment';
import Job from '../../../lib/k8s/job';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import Pod from '../../../lib/k8s/pod';
import ReplicaSet from '../../../lib/k8s/replicaSet';
import StatefulSet from '../../../lib/k8s/statefulSet';
import {
  EventStatus,
  HeadlampEvent,
  HeadlampEventType,
  useEventCallback,
} from '../../../redux/headlampEventSlice';
import { Activity } from '../../activity/Activity';
import ActionButton from '../ActionButton';
import { LogViewer } from '../LogViewer';
import { LightTooltip } from '../Tooltip';
import { ALL_SEVERITIES, filterLogsBySeverity, LogSeverity } from './logSeverityFilter';

// Component props interface
interface LogsButtonProps {
  item: KubeObject | null;
}

// Workload kinds whose pods can be aggregated by the Logs activity. Exported so
// plugin authors can check before calling launchWorkloadLogs().
export const LOGGABLE_WORKLOAD_KINDS: ReadonlySet<string> = new Set([
  'Deployment',
  'ReplicaSet',
  'DaemonSet',
  'StatefulSet',
  'Job',
]);

// Kind + apiGroup check via KubeObject.isClassOf — cross-bundle safe, unlike
// instanceof, which breaks when plugins ship their own class definitions.
function isLoggableWorkload(
  item: KubeObject | null
): item is Deployment | ReplicaSet | DaemonSet | StatefulSet | Job {
  return (
    !!item &&
    (Deployment.isClassOf(item) ||
      ReplicaSet.isClassOf(item) ||
      DaemonSet.isClassOf(item) ||
      StatefulSet.isClassOf(item) ||
      Job.isClassOf(item))
  );
}

// Styled component for consistent padding in form controls
const PaddedFormControlLabel = styled(FormControlLabel)(({ theme }) => ({
  margin: 0,
  paddingTop: theme.spacing(2),
  paddingRight: theme.spacing(2),
}));

function LogsButtonContent({ item }: LogsButtonProps) {
  const [pods, setPods] = useState<Pod[]>([]);
  const [selectedPodIndex, setSelectedPodIndex] = useState<number | 'all'>('all');
  const [selectedContainer, setSelectedContainer] = useState('');

  const [logs, setLogs] = useState<{ logs: string[]; lastLineShown: number }>({
    logs: [],
    lastLineShown: -1,
  });
  const [allPodLogs, setAllPodLogs] = useState<{ [podName: string]: string[] }>({});

  const [showTimestamps, setShowTimestamps] = useState<boolean>(true);
  const [follow, setFollow] = useState<boolean>(true);
  const [lines, setLines] = useState<number>(100);
  const [showPrevious, setShowPrevious] = React.useState<boolean>(false);
  const [showReconnectButton, setShowReconnectButton] = useState(false);
  const [selectedSeverities, setSelectedSeverities] = useState<LogSeverity[]>(() => {
    try {
      const stored = localStorage.getItem('headlamp.logs.severityFilter');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Normalize and validate against ALL_SEVERITIES
          const validSeverities = parsed.filter(s => ALL_SEVERITIES.includes(s as LogSeverity));
          if (validSeverities.length > 0) {
            return validSeverities as LogSeverity[];
          }
        }
      }
    } catch {
      // ignore parse errors
    }
    return [...ALL_SEVERITIES];
  });

  const xtermRef = React.useRef<XTerminal | null>(null);
  const processLogsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedLogsRef = useRef<{ [podName: string]: string[] } | null>(null);
  const selectedSeveritiesRef = useRef<LogSeverity[]>(selectedSeverities);

  useEffect(() => {
    selectedSeveritiesRef.current = selectedSeverities;
  }, [selectedSeverities]);

  // Re-render xterm when selectedSeverities changes without restarting the stream
  useEffect(() => {
    if (xtermRef.current && logs.logs.length > 0) {
      xtermRef.current.clear();
      const filtered = filterLogsBySeverity(logs.logs, selectedSeverities);
      xtermRef.current.write(filtered.join('').replaceAll('\n', '\r\n'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeverities]);
  const { t } = useTranslation(['glossary', 'translation']);
  const { enqueueSnackbar } = useSnackbar();

  const clearLogs = React.useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
    setLogs({ logs: [], lastLineShown: -1 });
  }, []);

  // Fetch related pods.
  async function getRelatedPods(): Promise<Pod[]> {
    if (isLoggableWorkload(item)) {
      try {
        const labelSelector =
          Job.isClassOf(item) && !item.spec.selector
            ? `batch.kubernetes.io/job-name=${item.metadata.name}`
            : labelSelectorToQuery(item.spec.selector);

        if (!labelSelector) {
          throw new Error(
            t('translation|No label selectors found for this {{type}}', {
              type: item.kind.toLowerCase(),
            })
          );
        }

        const queryParams = { labelSelector };

        const response = await clusterFetch(
          makeUrl(`/api/v1/namespaces/${item.metadata.namespace}/pods`, queryParams),
          { cluster: item.cluster }
        ).then(it => it.json());

        if (!response?.items) {
          throw new Error(t('translation|Invalid response from server'));
        }

        return response.items.map((podData: any) => new Pod(podData));
      } catch (error) {
        console.error('Error in getRelatedPods:', error);
        throw new Error(
          error instanceof Error ? error.message : t('translation|Failed to fetch related pods')
        );
      }
    }
    return [];
  }

  // Event handlers for log viewing options
  function handleLinesChange(event: any) {
    setLines(event.target.value);
  }

  function handleTimestampsChange() {
    setShowTimestamps(prev => !prev);
  }

  function handleFollowChange() {
    setFollow(prev => !prev);
  }

  function handlePreviousChange() {
    setShowPrevious(previous => !previous);
  }

  // Handler for initial logs button click
  async function onMount() {
    if (isLoggableWorkload(item)) {
      try {
        const fetchedPods = await getRelatedPods();
        if (fetchedPods.length > 0) {
          setPods(fetchedPods);
          setSelectedPodIndex('all');
          setSelectedContainer(fetchedPods[0].spec.containers[0].name);
        } else {
          enqueueSnackbar(t('translation|No pods found for this workload'), {
            variant: 'warning',
            autoHideDuration: 3000,
          });
        }
      } catch (error) {
        console.error('Error fetching pods:', error);
        enqueueSnackbar(
          t('translation|Failed to fetch pods: {{error}}', {
            error: error instanceof Error ? error.message : t('translation|Unknown error'),
          }),
          {
            variant: 'error',
            autoHideDuration: 5000,
          }
        );
      }
    }
  }

  useEffect(() => {
    onMount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Get containers for the selected pod
  const containers = React.useMemo(() => {
    if (!pods.length) return [];
    if (selectedPodIndex === 'all')
      return pods[0]?.spec?.containers?.map(container => container.name) || [];
    const selectedPod = pods[selectedPodIndex as number];
    return selectedPod?.spec?.containers?.map(container => container.name) || [];
  }, [pods, selectedPodIndex]);

  // Check if a container has been restarted
  function hasContainerRestarted(podName: string | undefined, containerName: string) {
    if (!podName) return false;
    const pod = pods.find(p => p.getName() === podName);
    const cont = pod?.status?.containerStatuses?.find(
      (c: KubeContainerStatus) => c.name === containerName
    );
    if (!cont) {
      return false;
    }

    return cont.restartCount > 0;
  }

  // Handler for reconnecting to logs stream
  function handleReconnect() {
    if (pods.length && selectedContainer) {
      setShowReconnectButton(false);
      setLogs({ logs: [], lastLineShown: -1 });
    }
  }

  // Function to process and display all logs
  const processAllLogs = React.useCallback(
    (logsData: { [podName: string]: string[] }) => {
      const allLogs: string[] = [];
      Object.entries(logsData).forEach(([podName, podLogs]) => {
        podLogs.forEach(log => {
          allLogs.push(`[${podName}] ${log}`);
        });
      });

      // Sort logs by timestamp
      allLogs.sort((a, b) => {
        const timestampA = a.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)?.[0] || '';
        const timestampB = b.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)?.[0] || '';
        return timestampA.localeCompare(timestampB);
      });

      // Apply severity filter before rendering
      const filteredLogs = filterLogsBySeverity(allLogs, selectedSeverities);

      if (xtermRef.current) {
        xtermRef.current.clear();
        xtermRef.current.write(filteredLogs.join('').replaceAll('\n', '\r\n'));
      }

      // Store RAW logs in state for downloads, not filtered
      setLogs({
        logs: allLogs,
        lastLineShown: allLogs.length - 1,
      });
    },
    [selectedSeverities]
  ); // Need selectedSeverities to re-filter

  // Function to fetch and aggregate logs from all pods
  const fetchAllPodsLogs = React.useCallback(
    (pods: Pod[], container: string): (() => void) => {
      clearLogs();
      setAllPodLogs({});

      const cleanups: Array<() => void> = [];

      pods.forEach(pod => {
        const cleanup = pod.getLogs(
          container,
          ({ logs: newLogs }: { logs: string[]; hasJsonLogs?: boolean }) => {
            const podName = pod.getName();
            setAllPodLogs(current => ({
              ...current,
              [podName]: newLogs,
            }));
          },
          {
            tailLines: lines,
            showPrevious,
            showTimestamps,
            follow,
            onReconnectStop: () => {
              setShowReconnectButton(true);
            },
          }
        );
        cleanups.push(cleanup);
      });

      return () => cleanups.forEach(cleanup => cleanup());
    },
    [clearLogs, lines, showPrevious, showTimestamps, follow]
  );

  // Effect for fetching and updating logs
  React.useEffect(() => {
    if (!selectedContainer) {
      return;
    }

    let cleanup: (() => void) | null = null;
    let isSubscribed = true;

    // Handle paused logs state - avoid fetching new logs
    if (!follow && logs.logs.length > 0) {
      return;
    }

    if (selectedPodIndex === 'all') {
      cleanup = fetchAllPodsLogs(pods, selectedContainer);
    } else {
      clearLogs();
      setAllPodLogs({}); // Clear aggregated logs when switching pods
      const pod = pods[selectedPodIndex as number];
      if (pod) {
        let lastLogLength = 0;
        cleanup = pod.getLogs(
          selectedContainer,
          ({ logs: newLogs }: { logs: string[]; hasJsonLogs?: boolean }) => {
            if (!isSubscribed) return;

            setLogs(current => {
              const terminalRef = xtermRef.current;
              if (!terminalRef) return current;

              // Only process new logs in chunks for better performance
              if (newLogs.length > lastLogLength) {
                const CHUNK_SIZE = 1000; // Process 1000 lines at a time
                const startIdx = lastLogLength;
                const endIdx = Math.min(startIdx + CHUNK_SIZE, newLogs.length);

                // Apply severity filter to the new chunk using the ref to avoid effect restart
                const chunk = newLogs.slice(startIdx, endIdx);
                const filteredChunk = filterLogsBySeverity(chunk, selectedSeveritiesRef.current);
                const filteredContent = filteredChunk.join('').replaceAll('\n', '\r\n');

                terminalRef.write(filteredContent);
                lastLogLength = endIdx;

                // If there are more logs to process, schedule them for the next frame
                if (endIdx < newLogs.length) {
                  requestAnimationFrame(() => {
                    setLogs(current => ({
                      ...current,
                      logs: newLogs, // Keep raw logs for downloads
                      lastLineShown: endIdx - 1,
                    }));
                  });
                  return current;
                }
              }

              return {
                logs: newLogs, // Keep raw logs
                lastLineShown: newLogs.length - 1,
              };
            });
          },
          {
            tailLines: lines,
            showPrevious,
            showTimestamps,
            follow,
            onReconnectStop: () => {
              if (isSubscribed) {
                setShowReconnectButton(true);
              }
            },
          }
        );
      }
    }

    return () => {
      isSubscribed = false;
      if (cleanup) {
        cleanup();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedPodIndex,
    selectedContainer,
    lines,
    showPrevious,
    showTimestamps,
    follow,
    clearLogs,
    pods,
  ]);

  // Effect to write paused logs message without triggering resubscription
  React.useEffect(() => {
    if (!follow && logs.logs.length > 0) {
      xtermRef.current?.write(
        '\n\n' +
          t('translation|Logs are paused. Click the follow button to resume following them.') +
          '\r\n'
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, t]);

  // Effect to process logs when allPodLogs changes - only for "All Pods" mode
  // Debounced to avoid expensive O(N log N) sort on every incoming log chunk
  React.useEffect(() => {
    if (
      selectedPodIndex === 'all' &&
      Object.keys(allPodLogs).length > 0 &&
      allPodLogs !== processedLogsRef.current
    ) {
      if (processLogsTimerRef.current) {
        clearTimeout(processLogsTimerRef.current);
        processLogsTimerRef.current = null;
      }
      processLogsTimerRef.current = setTimeout(() => {
        processLogsTimerRef.current = null;
        processedLogsRef.current = allPodLogs;
        processAllLogs(allPodLogs);
      }, 250);
    }
    return () => {
      if (processLogsTimerRef.current) {
        clearTimeout(processLogsTimerRef.current);
        processLogsTimerRef.current = null;
      }
    };
  }, [allPodLogs, selectedPodIndex, processAllLogs]);

  const topActions = [
    <Box
      key="container-controls"
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', width: '100%' }}
    >
      {/* Pod selection dropdown */}
      <FormControl sx={{ minWidth: 200 }}>
        <InputLabel>{t('translation|Select Pod')}</InputLabel>
        <Select
          value={selectedPodIndex}
          onChange={event => {
            setSelectedPodIndex(event.target.value as number | 'all');
            clearLogs();
          }}
          label={t('translation|Select Pod')}
        >
          <MenuItem value="all">{t('translation|All Pods')}</MenuItem>
          {pods.map((pod, index) => (
            <MenuItem key={pod.getName()} value={index}>
              {pod.getName()}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Container selection dropdown */}
      <FormControl sx={{ minWidth: 200 }}>
        <InputLabel>{t('translation|Container')}</InputLabel>
        <Select
          value={selectedContainer}
          onChange={event => {
            setSelectedContainer(event.target.value);
            clearLogs();
          }}
          label={t('translation|Container')}
        >
          {containers.map(container => (
            <MenuItem key={container} value={container}>
              {container}
              {hasContainerRestarted(
                pods[selectedPodIndex === 'all' ? 0 : selectedPodIndex]?.getName(),
                container
              ) && ` (${t('translation|Restarted')})`}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Lines selector */}
      <FormControl sx={{ minWidth: 120 }}>
        <InputLabel>Lines</InputLabel>
        <Select value={lines} onChange={handleLinesChange}>
          {[100, 1000, 2500].map(i => (
            <MenuItem key={i} value={i}>
              {i}
            </MenuItem>
          ))}
          <MenuItem value={-1}>All</MenuItem>
        </Select>
      </FormControl>

      {/* Severity filter dropdown */}
      <FormControl sx={{ minWidth: 140 }}>
        <InputLabel>{t('translation|Severity')}</InputLabel>
        <Select
          multiple
          value={selectedSeverities}
          onChange={event => {
            const value = event.target.value as LogSeverity[];
            if (value.length > 0) {
              setSelectedSeverities(value);
              localStorage.setItem('headlamp.logs.severityFilter', JSON.stringify(value));
            }
          }}
          label={t('translation|Severity')}
          renderValue={selected =>
            selected.length === ALL_SEVERITIES.length
              ? t('translation|All')
              : (selected as LogSeverity[]).map(s => s.toUpperCase()).join(', ')
          }
        >
          {ALL_SEVERITIES.map(severity => (
            <MenuItem key={severity} value={severity}>
              <Checkbox checked={selectedSeverities.includes(severity)} size="small" />
              <ListItemText primary={severity.toUpperCase()} />
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Show previous logs switch */}
      <LightTooltip
        title={
          hasContainerRestarted(
            selectedPodIndex === 'all'
              ? pods[0]?.getName()
              : pods[selectedPodIndex as number]?.getName(),
            selectedContainer
          )
            ? t('translation|Show logs for previous instances of this container.')
            : t(
                'translation|You can only select this option for containers that have been restarted.'
              )
        }
      >
        <PaddedFormControlLabel
          label={t('translation|Show previous')}
          disabled={
            !hasContainerRestarted(
              selectedPodIndex === 'all'
                ? pods[0]?.getName()
                : pods[selectedPodIndex as number]?.getName(),
              selectedContainer
            )
          }
          control={
            <Switch
              size="small"
              sx={{ transform: 'scale(0.8)' }}
              checked={showPrevious}
              onChange={handlePreviousChange}
            />
          }
        />
      </LightTooltip>

      {/* Timestamps switch */}
      <LightTooltip title={t('translation|Show timestamps in the logs.')}>
        <PaddedFormControlLabel
          control={
            <Switch
              checked={showTimestamps}
              onChange={handleTimestampsChange}
              size="small"
              sx={{ transform: 'scale(0.8)' }}
            />
          }
          label={t('translation|Timestamps')}
          disabled={false}
        />
      </LightTooltip>

      {/* Follow logs switch */}
      <LightTooltip title={t('translation|Follow logs in real-time.')}>
        <PaddedFormControlLabel
          control={
            <Switch
              checked={follow}
              onChange={handleFollowChange}
              size="small"
              sx={{ transform: 'scale(0.8)' }}
            />
          }
          label={t('translation|Follow')}
          disabled={false}
        />
      </LightTooltip>
    </Box>,
  ];

  return (
    <LogViewer
      noDialog
      title={item?.getName() || ''}
      downloadName={`${item?.getName()}_${
        selectedPodIndex === 'all' ? 'all_pods' : pods[selectedPodIndex as number]?.getName()
      }`}
      open
      onClose={() => {}}
      logs={logs.logs}
      topActions={topActions}
      xtermRef={xtermRef}
      handleReconnect={handleReconnect}
      showReconnectButton={showReconnectButton}
    />
  );
}

export function launchWorkloadLogs(
  item: KubeObject,
  dispatchHeadlampEvent?: (event: HeadlampEvent) => void
) {
  if (!isLoggableWorkload(item)) {
    return;
  }
  Activity.launch({
    id: 'logs-' + item.metadata.uid,
    title: 'Logs: ' + item.metadata.name,
    icon: <Icon icon="mdi:file-document-box-outline" width="100%" height="100%" />,
    cluster: item.cluster,
    location: 'full',
    content: <LogsButtonContent item={item} />,
  });
  dispatchHeadlampEvent?.({
    type: HeadlampEventType.LOGS,
    data: {
      status: EventStatus.OPENED,
    },
  });
}

export function LogsButton({ item }: LogsButtonProps) {
  const { t } = useTranslation();
  const dispatchHeadlampEvent = useEventCallback();

  const onClick = () => {
    if (!item) return;
    launchWorkloadLogs(item, dispatchHeadlampEvent);
  };

  return (
    <>
      {/* Show logs button for supported workload types */}
      {isLoggableWorkload(item) && (
        <ActionButton
          icon="mdi:file-document-box-outline"
          onClick={onClick}
          description={t('translation|Show logs')}
        />
      )}
    </>
  );
}

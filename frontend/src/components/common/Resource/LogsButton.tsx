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

import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  styled,
  Switch,
} from '@mui/material';
import FormControlLabel from '@mui/material/FormControlLabel';
import { Terminal as XTerminal } from '@xterm/xterm';
import { useSnackbar } from 'notistack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { request } from '../../../lib/k8s/apiProxy';
import { KubeContainerStatus } from '../../../lib/k8s/cluster';
import DaemonSet from '../../../lib/k8s/daemonSet';
import Deployment from '../../../lib/k8s/deployment';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import Pod from '../../../lib/k8s/pod';
import ReplicaSet from '../../../lib/k8s/replicaSet';
import ActionButton from '../ActionButton';
import { LogViewer } from '../LogViewer';
import { LightTooltip } from '../Tooltip';

interface LogsButtonProps {
  item: KubeObject | null;
}

const PaddedFormControlLabel = styled(FormControlLabel)(({ theme }) => ({
  margin: 0,
  paddingTop: theme.spacing(2),
  paddingRight: theme.spacing(2),
}));

export function LogsButton({ item }: LogsButtonProps) {
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [pods, setPods] = useState<Pod[]>([]);
  const [selectedPodName, setSelectedPodName] = useState<string | 'all'>('all');
  const [selectedContainer, setSelectedContainer] = useState('');
  const [displayedLogLines, setDisplayedLogLines] = useState<string[]>([]); // Primarily for download
  const [showTimestamps, setShowTimestamps] = useState<boolean>(true);
  const [follow, setFollow] = useState<boolean>(true); // Default to true
  const [lines, setLines] = useState<number>(100);
  const [showPrevious, setShowPrevious] = useState<boolean>(false);
  const [showReconnectButton, setShowReconnectButton] = useState(false);

  const xtermRef = useRef<XTerminal | null>(null);
  const { t } = useTranslation(['glossary', 'translation']);
  const { enqueueSnackbar } = useSnackbar();

  const activeStreamCleanupsRef = useRef<Array<() => void>>([]);
  const userScrolledUpRef = useRef<boolean>(false);
  const scrollListenerDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const streamGenerationRef = useRef<number>(0);

  const clearTerminalAndLogs = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
    setDisplayedLogLines([]);
  }, []);

  async function getRelatedPods(): Promise<Pod[]> {
    if (item instanceof Deployment || item instanceof ReplicaSet || item instanceof DaemonSet) {
      try {
        let labelSelector = '';
        const selector = item.spec.selector;
        if (selector?.matchLabels) {
          labelSelector = Object.entries(selector.matchLabels)
            .map(([key, value]) => `${key}=${value}`)
            .join(',');
        }
        if (!labelSelector && selector?.matchExpressions) {
          labelSelector = selector.matchExpressions
            .map((exp: { key: string; operator: string; values: string[] }) => {
              if (exp.operator === 'In' || exp.operator === 'Equals')
                return `${exp.key}=${exp.values[0]}`;
              return '';
            })
            .filter(Boolean)
            .join(',');
        }
        if (!labelSelector) {
          const resourceType = item.kind.toLowerCase();
          throw new Error(
            t('translation|No label selectors found for this {{type}}', { type: resourceType })
          );
        }
        const response = await request(
          `/api/v1/namespaces/${item.metadata.namespace}/pods?labelSelector=${labelSelector}`,
          { method: 'GET' }
        );
        if (!response?.items) throw new Error(t('translation|Invalid response from server'));
        return response.items.map((podData: any) => new Pod(podData));
      } catch (error) {
        throw error;
      }
    }
    return [];
  }

  async function handleClick() {
    if (item instanceof Deployment || item instanceof ReplicaSet || item instanceof DaemonSet) {
      try {
        const fetchedPods = await getRelatedPods();
        if (fetchedPods.length > 0) {
          setPods(fetchedPods);
          setSelectedPodName('all');

          let initialContainer = '';
          if (fetchedPods[0]?.spec?.containers?.length > 0) {
            initialContainer = fetchedPods[0].spec.containers[0].name;
          }
          setSelectedContainer(initialContainer);

          setFollow(true); // Explicitly set desired initial follow state
          userScrolledUpRef.current = false; // Reset scroll state

          setShowLogsDialog(true); // Set this last

          if (initialContainer === '') {
            enqueueSnackbar(
              t('translation|No containers found in the first pod. Please select a container.'),
              { variant: 'info', autoHideDuration: 5000 }
            );
          }
        } else {
          enqueueSnackbar(t('translation|No pods found for this workload'), {
            variant: 'warning',
            autoHideDuration: 3000,
          });
        }
      } catch (error: any) {
        enqueueSnackbar(
          t('translation|Failed to fetch pods: {{error}}', {
            error: error.message || String(error),
          }),
          { variant: 'error', autoHideDuration: 5000 }
        );
      }
    }
  }

  function handleCloseDialog() {
    setShowLogsDialog(false);
    setPods([]);
    setSelectedPodName('all');
    setSelectedContainer('');
    setDisplayedLogLines([]);
    setShowReconnectButton(false);
    userScrolledUpRef.current = false;
    activeStreamCleanupsRef.current.forEach(cleanup => cleanup());
    activeStreamCleanupsRef.current = [];
    if (scrollListenerDisposableRef.current) {
      scrollListenerDisposableRef.current.dispose();
      scrollListenerDisposableRef.current = null;
    }
  }

  const currentPodsForSelection = useMemo(() => {
    if (selectedPodName === 'all') return pods;
    const singlePod = pods.find(p => p.getName() === selectedPodName);
    return singlePod ? [singlePod] : [];
  }, [pods, selectedPodName]);

  const containersForSelection = useMemo(() => {
    if (!pods.length) return [];
    const podForContainerList =
      selectedPodName === 'all' || !pods.find(p => p.getName() === selectedPodName)
        ? pods[0]
        : pods.find(p => p.getName() === selectedPodName);
    return podForContainerList?.spec?.containers?.map(c => c.name) || [];
  }, [pods, selectedPodName]);

  useEffect(() => {
    activeStreamCleanupsRef.current.forEach(cleanup => cleanup());
    activeStreamCleanupsRef.current = [];
    if (scrollListenerDisposableRef.current) {
      scrollListenerDisposableRef.current.dispose();
      scrollListenerDisposableRef.current = null;
    }

    if (
      !showLogsDialog ||
      !selectedContainer ||
      !xtermRef.current ||
      currentPodsForSelection.length === 0
    ) {
      if (xtermRef.current && !showLogsDialog) xtermRef.current.clear();
      return;
    }

    const xterm = xtermRef.current;
    streamGenerationRef.current += 1;
    const currentStreamGeneration = streamGenerationRef.current;

    clearTerminalAndLogs();
    setShowReconnectButton(false);
    userScrolledUpRef.current = false;

    if (follow) {
      xterm.write(t('translation|Attempting to follow logs...') + '\r\n');
      setTimeout(() => {
        if (
          xtermRef.current &&
          currentStreamGeneration === streamGenerationRef.current &&
          !userScrolledUpRef.current
        ) {
          xtermRef.current.scrollToBottom();
        }
      }, 50);
    } else {
      xterm.write(t('translation|Fetching logs...') + '\r\n');
      // "Paused" message will be added after logs are fetched if any, or by a fallback timeout
    }

    const newCleanups: Array<() => void> = [];
    let initialLogsFetchedForNonFollow = false;

    currentPodsForSelection.forEach(pod => {
      const stopStreamFn = pod.getLogs(
        selectedContainer,
        (newLinesChunk: string[]) => {
          if (currentStreamGeneration !== streamGenerationRef.current) return;
          if (!xtermRef.current) return;

          const prefix = selectedPodName === 'all' && pods.length > 1 ? `[${pod.getName()}] ` : '';
          const textToWrite = newLinesChunk
            .map(line => prefix + (line.endsWith('\n') ? line : line + '\n'))
            .join('')
            .replaceAll('\n', '\r\n');
          xtermRef.current.write(textToWrite);
          setDisplayedLogLines(prev => [...prev, ...newLinesChunk.map(l => prefix + l)]);

          if (follow && !userScrolledUpRef.current && xtermRef.current) {
            setTimeout(() => {
              if (
                xtermRef.current &&
                currentStreamGeneration === streamGenerationRef.current &&
                !userScrolledUpRef.current
              ) {
                xtermRef.current.scrollToBottom();
              }
            }, 0);
          } else if (!follow && xtermRef.current && !initialLogsFetchedForNonFollow) {
            if (newLinesChunk.length > 0) {
              xtermRef.current.write(
                '\r\n' +
                  t(
                    'translation|Logs are paused. Click the follow button to resume following them.'
                  ) +
                  '\r\n'
              );
              initialLogsFetchedForNonFollow = true;
            }
            setTimeout(() => {
              // Scroll after writing static logs + paused message
              if (xtermRef.current && currentStreamGeneration === streamGenerationRef.current) {
                xtermRef.current.scrollToBottom();
              }
            }, 50);
          }
        },
        {
          tailLines: lines > 0 ? lines : undefined,
          showPrevious,
          showTimestamps,
          follow,
          onReconnectStop: () => {
            if (currentStreamGeneration !== streamGenerationRef.current) return;
            if (!xtermRef.current) return;
            setShowReconnectButton(true);
          },
        }
      );
      if (stopStreamFn) newCleanups.push(stopStreamFn);
    });
    activeStreamCleanupsRef.current = newCleanups;

    if (!follow) {
      setTimeout(() => {
        if (
          xtermRef.current &&
          currentStreamGeneration === streamGenerationRef.current &&
          !initialLogsFetchedForNonFollow
        ) {
          xtermRef.current.write(
            '\r\n' +
              t('translation|Logs are paused. Click the follow button to resume following them.') +
              '\r\n'
          );
          xtermRef.current.scrollToBottom();
        }
      }, 200);
    }

    if (follow && xterm) {
      scrollListenerDisposableRef.current = xterm.onScroll(() => {
        if (!xtermRef.current || currentStreamGeneration !== streamGenerationRef.current) return;
        const buffer = xtermRef.current.buffer.active;
        const isPhysicallyAtBottom = buffer.viewportY + xtermRef.current.rows >= buffer.length;
        if (isPhysicallyAtBottom) {
          if (userScrolledUpRef.current) {
            userScrolledUpRef.current = false;
            setTimeout(() => {
              if (
                xtermRef.current &&
                currentStreamGeneration === streamGenerationRef.current &&
                !userScrolledUpRef.current
              ) {
                xtermRef.current.scrollToBottom();
              }
            }, 0);
          }
        } else {
          if (!userScrolledUpRef.current) {
            userScrolledUpRef.current = true;
          }
        }
      });
    }

    return () => {
      activeStreamCleanupsRef.current.forEach(cleanup => cleanup());
      activeStreamCleanupsRef.current = [];
      if (scrollListenerDisposableRef.current) {
        scrollListenerDisposableRef.current.dispose();
        scrollListenerDisposableRef.current = null;
      }
    };
  }, [
    showLogsDialog,
    selectedPodName,
    selectedContainer,
    follow,
    lines,
    showPrevious,
    showTimestamps,
    pods,
    clearTerminalAndLogs,
    t,
    xtermRef, // xtermRef (object) as dependency to re-run if LogViewer sets .current
  ]);

  function handlePodSelectionChange(event: SelectChangeEvent<string | 'all'>) {
    const newPodName = event.target.value as string | 'all';
    setSelectedPodName(newPodName);
    userScrolledUpRef.current = false;
    const podToConsiderForContainer =
      newPodName === 'all'
        ? pods.length > 0
          ? pods[0]
          : null
        : pods.find(p => p.getName() === newPodName);
    if (podToConsiderForContainer) {
      const currentContainerExists = podToConsiderForContainer.spec.containers.some(
        c => c.name === selectedContainer
      );
      if (!currentContainerExists && podToConsiderForContainer.spec.containers.length > 0) {
        setSelectedContainer(podToConsiderForContainer.spec.containers[0].name);
      } else if (!currentContainerExists) {
        setSelectedContainer('');
      }
    } else if (pods.length > 0 && pods[0].spec.containers.length > 0) {
      // Fallback if selected pod disappears
      setSelectedContainer(pods[0].spec.containers[0].name);
    } else {
      setSelectedContainer('');
    }
  }

  function handleContainerSelectionChange(event: SelectChangeEvent<string>) {
    setSelectedContainer(event.target.value);
    userScrolledUpRef.current = false;
  }

  function handleActualReconnect() {
    setShowReconnectButton(false);
    // The main useEffect will re-run due to its dependencies.
  }

  function handleFollowToggle() {
    setFollow(f => {
      const newFollowState = !f;
      // Message for turning follow OFF is now handled by the main useEffect
      // when it re-runs with follow: false.
      userScrolledUpRef.current = false;
      return newFollowState;
    });
  }

  function hasAnyContainerRestarted(
    podNameForCheck: string | undefined,
    containerName: string
  ): boolean {
    if (!containerName) return false;
    const podToCheck = podNameForCheck
      ? pods.find(p => p.getName() === podNameForCheck)
      : pods.length > 0
      ? pods[0]
      : null;
    if (!podToCheck) return false;
    const contStatus = podToCheck.status?.containerStatuses?.find(
      (c: KubeContainerStatus) => c.name === containerName
    );
    return contStatus ? contStatus.restartCount > 0 : false;
  }

  const topActions = [
    <Box
      key="log-controls"
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', width: '100%' }}
    >
      <FormControl sx={{ minWidth: 200, flexGrow: 1 }}>
        <InputLabel id="pod-select-label">{t('translation|Select Pod')}</InputLabel>
        <Select
          labelId="pod-select-label"
          value={selectedPodName}
          onChange={handlePodSelectionChange}
          label={t('translation|Select Pod')}
        >
          <MenuItem value="all">
            {t('translation|All Pods')} ({pods.length})
          </MenuItem>
          {pods.map(pod => (
            <MenuItem key={pod.getName()} value={pod.getName()}>
              {pod.getName()}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl sx={{ minWidth: 200, flexGrow: 1 }}>
        <InputLabel id="container-select-label">{t('translation|Container')}</InputLabel>
        <Select
          labelId="container-select-label"
          value={containersForSelection.includes(selectedContainer) ? selectedContainer : ''}
          onChange={handleContainerSelectionChange}
          label={t('translation|Container')}
          displayEmpty
          disabled={containersForSelection.length === 0}
        >
          {containersForSelection.length === 0 && (
            <MenuItem value="" disabled>
              {t('translation|No containers')}
            </MenuItem>
          )}
          {containersForSelection.map(cName => (
            <MenuItem key={cName} value={cName}>
              {' '}
              {cName}{' '}
              {hasAnyContainerRestarted(
                selectedPodName === 'all' ? pods[0]?.getName() : selectedPodName,
                cName
              ) && ` (${t('translation|Restarted')})`}{' '}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl sx={{ minWidth: 120 }}>
        <InputLabel id="lines-select-label">{t('translation|Lines')}</InputLabel>
        <Select
          labelId="lines-select-label"
          value={lines}
          onChange={e => setLines(e.target.value as number)}
        >
          {[100, 1000, 2500].map(i => (
            <MenuItem key={i} value={i}>
              {i}
            </MenuItem>
          ))}
          <MenuItem value={-1}>{t('translation|All')}</MenuItem>
        </Select>
      </FormControl>
      <LightTooltip
        title={
          hasAnyContainerRestarted(
            selectedPodName === 'all' ? pods[0]?.getName() : selectedPodName,
            selectedContainer
          )
            ? t('translation|Show logs for previous instances of this container.')
            : t(
                'translation|You can only select this option for containers that have been restarted.'
              )
        }
      >
        <span>
          <PaddedFormControlLabel
            label={t('translation|Show previous')}
            disabled={
              !selectedContainer ||
              !hasAnyContainerRestarted(
                selectedPodName === 'all' ? pods[0]?.getName() : selectedPodName,
                selectedContainer
              )
            }
            control={<Switch checked={showPrevious} onChange={() => setShowPrevious(p => !p)} />}
          />
        </span>
      </LightTooltip>
      <PaddedFormControlLabel
        control={
          <Switch
            checked={showTimestamps}
            onChange={() => setShowTimestamps(ts => !ts)}
            size="small"
          />
        }
        label={t('translation|Timestamps')}
      />
      <PaddedFormControlLabel
        control={<Switch checked={follow} onChange={handleFollowToggle} size="small" />}
        label={t('translation|Follow')}
      />
    </Box>,
  ];

  return (
    <>
      {(item instanceof Deployment || item instanceof ReplicaSet || item instanceof DaemonSet) && (
        <ActionButton
          icon="mdi:file-document-box-outline"
          onClick={handleClick}
          description={t('translation|Show logs')}
          iconButtonProps={{ disabled: !item }}
        />
      )}
      {showLogsDialog && (
        <LogViewer
          title={`${item?.getName() || 'Workload'} Logs`}
          downloadName={`${item?.getName() || 'workload'}_${
            selectedPodName === 'all' ? 'all_pods' : selectedPodName
          }_${selectedContainer || 'logs'}`}
          open={showLogsDialog}
          onClose={handleCloseDialog}
          logs={displayedLogLines}
          topActions={topActions}
          xtermRef={xtermRef}
          handleReconnect={handleActualReconnect}
          showReconnectButton={showReconnectButton}
        />
      )}
    </>
  );
}

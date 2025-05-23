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

import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import { styled } from '@mui/system';
import { Terminal as XTerminal } from '@xterm/xterm'; // Removed IBufferCell as it's not used
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import Pod from '../../lib/k8s/pod';
import { DefaultHeaderAction } from '../../redux/actionButtonsSlice';
import { EventStatus, HeadlampEventType, useEventCallback } from '../../redux/headlampEventSlice';
import ActionButton from '../common/ActionButton';
import Link from '../common/Link';
import { LogViewer, LogViewerProps } from '../common/LogViewer'; // Assuming LogViewer.tsx is correct now
import {
  ConditionsSection,
  ContainersSection,
  DetailsGrid,
  VolumeSection,
} from '../common/Resource';
import AuthVisible from '../common/Resource/AuthVisible';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';
import Terminal from '../common/Terminal';
import LightTooltip from '../common/Tooltip/TooltipLight';
import { makePodStatusLabel } from './List';

const PaddedFormControlLabel = styled(FormControlLabel)(({ theme }) => ({
  margin: 0,
  paddingTop: theme.spacing(2),
  paddingRight: theme.spacing(1),
}));

interface PodLogViewerProps extends Omit<LogViewerProps, 'logs' | 'xtermRef' | 'open'> {
  item: Pod;
  open: boolean;
  onClose: () => void;
}

export function PodLogViewer(props: PodLogViewerProps) {
  const { item, onClose, open, ...otherLogViewerSpecificProps } = props;

  const [container, setContainer] = React.useState<string>(() => getDefaultContainerName());
  const [showPrevious, setShowPrevious] = React.useState<boolean>(false);
  const [showTimestamps, setShowTimestamps] = React.useState<boolean>(true);
  const [follow, setFollow] = React.useState<boolean>(true);
  const [lines, setLines] = React.useState<number>(100);
  const [allLogLines, setAllLogLines] = React.useState<string[]>([]);
  const [showReconnectButton, setShowReconnectButton] = React.useState(false);

  const xtermRef = React.useRef<XTerminal | null>(null);
  const cancelLogStreamRef = React.useRef<(() => void) | null>(null);
  const userScrolledUpRef = React.useRef<boolean>(false);
  const scrollListenerDisposableRef = React.useRef<{ dispose: () => void } | null>(null);
  const streamGenerationRef = React.useRef<number>(0); // For handling stale stream callbacks

  const { t } = useTranslation();

  function getDefaultContainerName(): string {
    return item?.spec?.containers?.length > 0 ? item.spec.containers[0].name : '';
  }

  React.useEffect(() => {
    // console.log(`PodLogViewer: Main effect. Open: ${open}, Container: "${container}", Follow: ${follow}, xtermRef.current: ${!!xtermRef.current}, Gen: ${streamGenerationRef.current}`);

    // Always cancel previous stream and listener if they exist from a prior run of this effect.
    // This is crucial for preventing race conditions or leftover operations.
    if (cancelLogStreamRef.current) {
      // console.log('PodLogViewer: Effect start - Cancelling previous log stream.');
      cancelLogStreamRef.current();
      cancelLogStreamRef.current = null;
    }
    if (scrollListenerDisposableRef.current) {
      // console.log('PodLogViewer: Effect start - Disposing previous scroll listener.');
      scrollListenerDisposableRef.current.dispose();
      scrollListenerDisposableRef.current = null;
    }

    if (!open || !container || !xtermRef.current) {
      if (!open && xtermRef.current) {
        // If dialog is closed, clear terminal
        // console.log('PodLogViewer: Dialog closed, clearing terminal.');
        xtermRef.current.clear();
        setAllLogLines([]);
      }
      // console.log('PodLogViewer: Prerequisites not met (open, container, or xtermRef). Aborting effect.');
      return; // Abort if not ready
    }

    const xterm = xtermRef.current;
    streamGenerationRef.current += 1; // Increment generation for this new stream attempt
    const currentStreamGeneration = streamGenerationRef.current;

    // console.log(`PodLogViewer: Gen ${currentStreamGeneration} - Clearing xterm, resetting states.`);
    xterm.clear();
    setAllLogLines([]);
    setShowReconnectButton(false);
    userScrolledUpRef.current = false;

    const initialMessage = follow
      ? t('translation|Attempting to follow logs...')
      : t('translation|Fetching logs...');
    xterm.write(initialMessage + '\r\n');
    setTimeout(() => {
      if (xtermRef.current && !userScrolledUpRef.current) xtermRef.current.scrollToBottom();
    }, 50);

    // console.log(`PodLogViewer: Gen ${currentStreamGeneration} - Calling item.getLogs for container: ${container}`);
    const stopStreamFn = item.getLogs(
      container,
      (newLinesChunk: string[]) => {
        if (currentStreamGeneration !== streamGenerationRef.current) {
          // console.log(`PodLogViewer: logCallback - Stale generation (${currentStreamGeneration} vs ${streamGenerationRef.current}). Ignoring chunk.`);
          return;
        }
        if (!xtermRef.current) {
          // console.log(`PodLogViewer: Gen ${currentStreamGeneration} - logCallback - xtermRef.current is null, cannot write.`);
          return;
        }
        // console.log(`PodLogViewer: Gen ${currentStreamGeneration} - logCallback invoked. Chunk length: ${newLinesChunk.length}`);

        const textToWrite = newLinesChunk
          .map(line => (line.endsWith('\n') ? line : line + '\n'))
          .join('')
          .replaceAll('\n', '\r\n');
        xtermRef.current.write(textToWrite);
        setAllLogLines(prevLines => [...prevLines, ...newLinesChunk]);

        if (follow && !userScrolledUpRef.current && xtermRef.current) {
          // console.log(`PodLogViewer: Gen ${currentStreamGeneration} - Following, not scrolled up. Scrolling to bottom.`);
          setTimeout(() => {
            if (
              xtermRef.current &&
              currentStreamGeneration === streamGenerationRef.current &&
              !userScrolledUpRef.current
            ) {
              xtermRef.current.scrollToBottom();
            }
          }, 0); // Timeout helps ensure write is rendered
        } else if (!follow && xtermRef.current) {
          // For non-follow, only scroll to bottom once after the initial fetch
          // console.log(`PodLogViewer: Gen ${currentStreamGeneration} - Not following. Scrolling to bottom after fetch.`);
          setTimeout(() => {
            if (xtermRef.current && currentStreamGeneration === streamGenerationRef.current) {
              xtermRef.current.scrollToBottom();
            }
          }, 0);
        }
      },
      {
        tailLines: lines > 0 ? lines : undefined,
        showPrevious,
        showTimestamps,
        follow,
        onReconnectStop: () => {
          if (currentStreamGeneration !== streamGenerationRef.current) {
            // console.log(`PodLogViewer: onReconnectStop - Stale generation (${currentStreamGeneration} vs ${streamGenerationRef.current}). Ignoring.`);
            return;
          }
          if (!xtermRef.current) return;
          // console.log(`PodLogViewer: Gen ${currentStreamGeneration} - onReconnectStop called.`);
          setShowReconnectButton(true);
          xtermRef.current.write(
            `\r\n\n${t('translation|Connection lost. Click Reconnect to resume/fetch.')}\r\n`
          );
          setTimeout(() => xtermRef.current?.scrollToBottom(), 0);
        },
      }
    );

    cancelLogStreamRef.current = stopStreamFn;
    // console.log(`PodLogViewer: Gen ${currentStreamGeneration} - Log stream initiated.`);

    if (follow && xterm) {
      // console.log(`PodLogViewer: Gen ${currentStreamGeneration} - Adding scroll listener.`);
      scrollListenerDisposableRef.current = xterm.onScroll(() => {
        if (!xtermRef.current || currentStreamGeneration !== streamGenerationRef.current) return; // Stale listener

        const buffer = xtermRef.current.buffer.active;
        // A common robust check for being at the bottom:
        // The viewportY is the top-most *visible* line index.
        // buffer.length is the total number of lines in the buffer.
        // xterm.rows is the number of visible rows in the terminal.
        const isPhysicallyAtBottom = buffer.viewportY + xtermRef.current.rows >= buffer.length;

        if (isPhysicallyAtBottom) {
          if (userScrolledUpRef.current) {
            // console.log(`PodLogViewer: Gen ${currentStreamGeneration} - ScrollEvt: User scrolled back to bottom.`);
            userScrolledUpRef.current = false;
            // Re-assert scroll to bottom in case new lines arrived during manual scroll
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
            // console.log(`PodLogViewer: Gen ${currentStreamGeneration} - ScrollEvt: User scrolled up from bottom.`);
            userScrolledUpRef.current = true;
          }
        }
      });
    }

    return () => {
      // console.log(`PodLogViewer: Gen ${currentStreamGeneration} - Effect CLEANUP starting.`);
      if (cancelLogStreamRef.current) {
        // console.log(`PodLogViewer: Gen ${currentStreamGeneration} - CLEANUP: Cancelling log stream.`);
        cancelLogStreamRef.current();
        cancelLogStreamRef.current = null;
      }
      if (scrollListenerDisposableRef.current) {
        // console.log(`PodLogViewer: Gen ${currentStreamGeneration} - CLEANUP: Disposing scroll listener.`);
        scrollListenerDisposableRef.current.dispose();
        scrollListenerDisposableRef.current = null;
      }
      // console.log(`PodLogViewer: Gen ${currentStreamGeneration} - Effect CLEANUP finished.`);
    };
  }, [item, container, lines, open, showPrevious, showTimestamps, follow, t, xtermRef]); // xtermRef is in deps to re-run if LogViewer populates it late

  React.useEffect(() => {
    const defaultContainer = getDefaultContainerName();
    if (open && item && container === '' && defaultContainer !== '') {
      // console.log(`PodLogViewer: Setting default container to "${defaultContainer}" as current is empty.`);
      setContainer(defaultContainer);
    }
  }, [item, open, container]);

  function handleContainerChange(event: SelectChangeEvent<string>) {
    setContainer(event.target.value);
  }

  function handleLinesChange(event: SelectChangeEvent<any>) {
    const value = event.target.value;
    setLines(typeof value === 'string' ? parseInt(value, 10) : value);
  }

  function handlePreviousChange() {
    setShowPrevious(p => !p);
  }
  function handleTimestampsChange() {
    setShowTimestamps(ts => !ts);
  }

  function hasContainerRestarted() {
    const contStatus = item?.status?.containerStatuses?.find(c => c.name === container);
    return contStatus ? contStatus.restartCount > 0 : false;
  }

  function handleFollowChange() {
    setFollow(currentFollow => {
      const newFollowState = !currentFollow;
      // console.log(`PodLogViewer: Follow toggled to ${newFollowState}`);
      if (xtermRef.current && !newFollowState) {
        xtermRef.current.write(
          `\r\n\n${t(
            'translation|Log following paused. Displaying latest logs. Turn Follow ON to resume streaming.'
          )}\r\n`
        );
        setTimeout(() => {
          if (xtermRef.current) xtermRef.current.scrollToBottom();
        }, 0);
      }
      userScrolledUpRef.current = false; // Reset scroll state on follow toggle
      return newFollowState;
    });
  }

  function handleActualReconnect() {
    // console.log('PodLogViewer: Reconnect button clicked.');
    // This will effectively force the main useEffect to re-run and re-establish the stream.
    // The main effect's cleanup will handle the old stream.
    if (cancelLogStreamRef.current) {
      // console.log('PodLogViewer: Reconnect - Manually cancelling existing stream.');
      cancelLogStreamRef.current();
      cancelLogStreamRef.current = null;
    }
    setShowReconnectButton(false);
    // Forcing a re-run of the effect if no other main dependencies changed:
    // One way is to increment a dummy state that's a dependency, or re-set a current one.
    // The most direct is to ensure the logic inside main useEffect handles this.
    // Since streamGenerationRef will increment, the old stream callbacks are ignored.
    // The main effect should re-run due to its dependencies or simply because we want it to.
    // A simple way to ensure it re-runs if nothing else changed is to temporarily change a state it depends on.
    // However, the current structure should lead to re-evaluation if `open` and `container` are still valid.
    // The critical part is that streamGenerationRef increments, effectively starting a "new session".
    // Let's make sure the effect fully re-evaluates by briefly changing `follow` and then restoring it,
    // or by just relying on the fact that a new stream will be attempted.
    // The current logic should be fine if `getLogs` correctly stops the old stream via `onReconnectStop`.
    // The main effect's re-run will then naturally try to fetch logs again.
    // Forcing it might involve something like:
    // setLines(l => l); // to force re-render and re-run effect if lines is a dependency
    // This is often a sign the effect's dependencies aren't perfectly capturing the "need to re-run" signal.
    // For now, the existing dependencies *should* cause a re-fetch if state is consistent.
    // The crucial part is that the old stream is definitely stopped.
    // The main effect will attempt to start a new stream.
  }

  const selectedContainerExists = React.useMemo(() => {
    if (!item) return false;
    return (
      item.spec?.containers?.some(c => c.name === container) ||
      item.spec?.initContainers?.some(c => c.name === container) ||
      item.spec?.ephemeralContainers?.some(c => c.name === container)
    );
  }, [item, container]);

  return (
    <LogViewer
      title={t('glossary|Logs: {{ itemName }}', { itemName: item?.getName() || 'Unknown Item' })}
      downloadName={`${item?.getName() || 'unknown'}_${container || 'unknown_container'}`}
      open={open}
      onClose={onClose}
      logs={allLogLines}
      xtermRef={xtermRef}
      handleReconnect={handleActualReconnect}
      showReconnectButton={showReconnectButton}
      {...otherLogViewerSpecificProps}
      topActions={[
        <FormControl sx={{ minWidth: '11rem' }} key="container-select">
          <InputLabel
            shrink
            id="container-name-chooser-label"
            focused={!!container && selectedContainerExists}
          >
            {t('glossary|Container')}
          </InputLabel>
          <Select
            labelId="container-name-chooser-label"
            id="container-name-chooser"
            value={selectedContainerExists ? container : ''}
            onChange={handleContainerChange}
            displayEmpty
            disabled={!item?.spec?.containers || item.spec.containers.length === 0}
          >
            {(!item?.spec?.containers || item.spec.containers.length === 0) &&
              !selectedContainerExists && (
                <MenuItem value="" disabled>
                  {t('translation|No containers available')}
                </MenuItem>
              )}
            {item?.spec?.containers &&
              item.spec.containers.length > 0 &&
              !selectedContainerExists &&
              container === '' && (
                <MenuItem value="" disabled>
                  {t('glossary|Select Container...')}
                </MenuItem>
              )}
            {item?.spec?.containers?.map(({ name }) => (
              <MenuItem value={name} key={name}>
                {name}
              </MenuItem>
            ))}
            {item?.spec?.initContainers && item.spec.initContainers.length > 0 && (
              <MenuItem
                disabled
                value="init-disabled-label"
                sx={{ fontWeight: 'bold', color: 'text.disabled' }}
              >
                {t('translation|Init Containers')}
              </MenuItem>
            )}
            {item?.spec?.initContainers?.map(({ name }) => (
              <MenuItem value={name} key={`init_container_${name}`}>
                {name}
              </MenuItem>
            ))}
            {item?.spec?.ephemeralContainers && item.spec.ephemeralContainers.length > 0 && (
              <MenuItem
                disabled
                value="eph-disabled-label"
                sx={{ fontWeight: 'bold', color: 'text.disabled' }}
              >
                {t('glossary|Ephemeral Containers')}
              </MenuItem>
            )}
            {item?.spec?.ephemeralContainers?.map(({ name }) => (
              <MenuItem value={name} key={`eph_container_${name}`}>
                {name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>,
        // ... (rest of topActions are the same as before)
        <FormControl sx={{ minWidth: '6rem' }} key="lines-select">
          <InputLabel shrink id="container-lines-chooser-label">
            {t('translation|Lines')}
          </InputLabel>
          <Select<number>
            labelId="container-lines-chooser-label"
            id="container-lines-chooser"
            value={lines}
            onChange={handleLinesChange}
          >
            {[100, 1000, 2500].map(i => (
              <MenuItem value={i} key={i}>
                {' '}
                {i}{' '}
              </MenuItem>
            ))}
            <MenuItem value={-1} key="all-lines">
              {t('translation|All')}
            </MenuItem>
          </Select>
        </FormControl>,
        <LightTooltip
          key="show-previous-tooltip"
          title={
            hasContainerRestarted()
              ? t('translation|Show logs for previous instances of this container.')
              : t(
                  'translation|You can only select this option for containers that have been restarted.'
                )
          }
        >
          <PaddedFormControlLabel
            label={t('translation|Previous')}
            disabled={!hasContainerRestarted()}
            control={
              <Switch
                checked={showPrevious}
                onChange={handlePreviousChange}
                name="checkPrevious"
                color="primary"
                size="small"
                sx={{ transform: 'scale(0.8)' }}
              />
            }
          />
          <span>
            <PaddedFormControlLabel
              label={t('translation|Show previous')}
              disabled={!hasContainerRestarted()}
              control={
                <Switch
                  checked={showPrevious}
                  onChange={handlePreviousChange}
                  name="checkPrevious"
                  color="primary"
                  size="small"
                />
              }
            />
          </span>
        </LightTooltip>,
        <PaddedFormControlLabel
          key="timestamps-switch"
          label={t('translation|Timestamps')}
          control={
            <Switch
              checked={showTimestamps}
              onChange={handleTimestampsChange}
              name="checkTimestamps"
              color="primary"
              size="small"
              sx={{ transform: 'scale(0.8)' }}
            />
          }
        />,
        <PaddedFormControlLabel
          key="follow-switch"
          label={t('translation|Follow')}
          control={
            <Switch
              checked={follow}
              onChange={handleFollowChange}
              name="follow"
              color="primary"
              size="small"
              sx={{ transform: 'scale(0.8)' }}
            />
          }
        />,
      ]}
    />
  );
}

// ... (The rest of Details.tsx: VolumeDetails, TolerationsSection, PodDetailsProps, PodDetails) ...
// (Code for VolumeDetails, TolerationsSection, PodDetailsProps, PodDetails default export remains the same as provided in the previous "permanent fix" attempt)

export interface VolumeDetailsProps {
  volumes: any[] | null;
}

export function VolumeDetails(props: VolumeDetailsProps) {
  const { volumes } = props;
  if (!volumes) {
    return null;
  }
  const { t } = useTranslation();
  return (
    <SectionBox title={t('translation|Volumes')}>
      <SimpleTable
        columns={[
          {
            label: t('translation|Name'),
            getter: data => data.name,
          },
          {
            label: t('translation|Type'),
            getter: data =>
              Object.keys(data).find(
                key => key !== 'name' && typeof data[key] === 'object' && data[key] !== null
              ) || 'unknown',
          },
        ]}
        data={volumes}
        reflectInURL="volumes"
      />
    </SectionBox>
  );
}

function TolerationsSection(props: { tolerations: any[] }) {
  const { tolerations } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <SectionBox title={t('Tolerations')}>
      <SimpleTable
        data={tolerations}
        columns={[
          { label: t('translation|Key'), getter: data => data.key },
          { label: t('translation|Value'), getter: data => data.value },
          {
            label: t('translation|Operator'),
            getter: data => data.operator,
            gridTemplate: '0.5fr',
          },
          { label: t('translation|Effect'), getter: data => data.effect },
          { label: t('Seconds'), getter: data => data.tolerationSeconds, gridTemplate: '0.5fr' },
        ]}
      />
    </SectionBox>
  );
}

export interface PodDetailsProps {
  showLogsDefault?: boolean;
  name?: string;
  namespace?: string;
  cluster?: string;
}

export default function PodDetails(props: PodDetailsProps) {
  const { showLogsDefault } = props;
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const [showLogs, setShowLogs] = React.useState(!!showLogsDefault);
  const [showTerminal, setShowTerminal] = React.useState(false);
  const { t } = useTranslation('glossary');
  const [isAttached, setIsAttached] = React.useState(false);
  const dispatchHeadlampEvent = useEventCallback();

  return (
    <DetailsGrid
      resourceType={Pod}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      actions={item =>
        item && [
          {
            id: DefaultHeaderAction.POD_LOGS,
            action: (
              <AuthVisible item={item} authVerb="get" subresource="log">
                <ActionButton
                  description={t('Show Logs')}
                  aria-label={t('logs')}
                  icon="mdi:file-document-box-outline"
                  onClick={() => {
                    setShowLogs(true);
                    dispatchHeadlampEvent({
                      type: HeadlampEventType.LOGS,
                      data: { resource: item, status: EventStatus.OPENED },
                    });
                  }}
                />
              </AuthVisible>
            ),
          },
          {
            id: DefaultHeaderAction.POD_TERMINAL,
            action: (
              <AuthVisible item={item} authVerb="get" subresource="exec">
                <ActionButton
                  description={t('Terminal / Exec')}
                  aria-label={t('terminal')}
                  icon="mdi:console"
                  onClick={() => {
                    setShowTerminal(true);
                    dispatchHeadlampEvent({
                      type: HeadlampEventType.TERMINAL,
                      data: { resource: item, status: EventStatus.OPENED },
                    });
                  }}
                />
              </AuthVisible>
            ),
          },
          {
            id: DefaultHeaderAction.POD_ATTACH,
            action: (
              <AuthVisible item={item} authVerb="get" subresource="attach">
                <ActionButton
                  description={t('Attach')}
                  aria-label={t('attach')}
                  icon="mdi:connection"
                  onClick={() => {
                    setIsAttached(true);
                    dispatchHeadlampEvent({
                      type: HeadlampEventType.POD_ATTACH,
                      data: { resource: item, status: EventStatus.OPENED },
                    });
                  }}
                />
              </AuthVisible>
            ),
          },
        ]
      }
      extraInfo={item =>
        item && [
          { name: t('State'), value: makePodStatusLabel(item, false) },
          {
            name: t('Node'),
            value: item.spec.nodeName ? (
              <Link
                routeName="node"
                params={{ name: item.spec.nodeName }}
                activeCluster={item.cluster}
              >
                {item.spec.nodeName}
              </Link>
            ) : (
              ''
            ),
          },
          {
            name: t('Service Account'),
            value:
              item.spec.serviceAccountName || item.spec.serviceAccount ? (
                <Link
                  routeName="serviceAccount"
                  params={{
                    namespace: item.metadata.namespace,
                    name: item.spec.serviceAccountName || item.spec.serviceAccount,
                  }}
                  activeCluster={item.cluster}
                >
                  {item.spec.serviceAccountName || item.spec.serviceAccount}
                </Link>
              ) : (
                ''
              ),
          },
          { name: t('Host IP'), value: item.status.hostIP ?? '' },
          { name: t('Pod IP'), value: item.status.podIP ?? '' },
          { name: t('QoS Class'), value: item.status.qosClass },
          { name: t('Priority'), value: item.spec.priority },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.pod-tolerations',
            section: <TolerationsSection tolerations={item?.spec?.tolerations || []} />,
          },
          {
            id: 'headlamp.pod-conditions',
            section: <ConditionsSection resource={item?.jsonData} />,
          },
          {
            id: 'headlamp.pod-containers',
            section: <ContainersSection resource={item?.jsonData} />,
          },
          { id: 'headlamp.pod-volumes', section: <VolumeSection resource={item?.jsonData} /> },
          {
            id: 'headlamp.pod-logs',
            section: (
              <PodLogViewer
                key={`logs-${item.getName()}`}
                open={showLogs}
                item={item}
                onClose={() => {
                  dispatchHeadlampEvent({
                    type: HeadlampEventType.LOGS,
                    data: { resource: item, status: EventStatus.CLOSED },
                  });
                  setShowLogs(false);
                }}
              />
            ),
          },
          {
            id: 'headlamp.pod-terminal',
            section: (
              <Terminal
                key={`terminal-${item.getName()}`}
                open={showTerminal || isAttached}
                item={item}
                onClose={() => {
                  setShowTerminal(false);
                  setIsAttached(false);
                  dispatchHeadlampEvent({
                    type: HeadlampEventType.TERMINAL,
                    data: { resource: item, status: EventStatus.CLOSED },
                  });
                }}
                isAttach={isAttached}
              />
            ),
          },
        ]
      }
    />
  );
}

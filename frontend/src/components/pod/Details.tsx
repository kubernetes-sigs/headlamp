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
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import { styled } from '@mui/system';
import { Terminal as XTerminal } from '@xterm/xterm';
import _ from 'lodash';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { KubeContainerStatus } from '../../lib/k8s/cluster';
import Pod from '../../lib/k8s/pod';
import { DefaultHeaderAction } from '../../redux/actionButtonsSlice';
import { EventStatus, HeadlampEventType, useEventCallback } from '../../redux/headlampEventSlice';
import { Activity } from '../activity/Activity';
import ActionButton from '../common/ActionButton';
import Link from '../common/Link';
import { LogViewer, LogViewerProps } from '../common/LogViewer';
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
import { colorizePrettifiedLog } from './jsonHandling';
import { makePodStatusLabel } from './List';

const PaddedFormControlLabel = styled(FormControlLabel)(({ theme }) => ({
  margin: 0,
  paddingTop: theme.spacing(2),
  paddingRight: theme.spacing(1),
}));

interface PodLogViewerProps extends Omit<LogViewerProps, 'logs'> {
  item: Pod;
}

export function PodLogViewer(props: PodLogViewerProps) {
  const { item, onClose, open, ...other } = props;
  const [container, setContainer] = React.useState(getDefaultContainer());
  const [showPrevious, setShowPrevious] = React.useState<boolean>(false);
  const [showTimestamps, setShowTimestamps] = React.useState<boolean>(true);
  const [follow, setFollow] = React.useState<boolean>(true);
  const [prettifyLogs, setPrettifyLogs] = React.useState<boolean>(false);
  const [formatJsonValues, setFormatJsonValues] = React.useState<boolean>(false);
  const [hasJsonLogs, setHasJsonLogs] = React.useState<boolean>(false);
  const [lines, setLines] = React.useState<number>(100);
  const [logs, setLogs] = React.useState<{ logs: string[]; lastLineShown: number }>({
    logs: [],
    lastLineShown: -1,
  });
  const [showReconnectButton, setShowReconnectButton] = React.useState(false);
  const [cancelLogsStream, setCancelLogsStream] = React.useState<(() => void) | null>(null);
  const xtermRef = React.useRef<XTerminal | null>(null);
  const { t } = useTranslation();

  function getDefaultContainer() {
    return item.spec.containers.length > 0 ? item.spec.containers[0].name : '';
  }

  const options = { leading: true, trailing: true, maxWait: 1000 };

  function setLogsDebounced({
    logs: logLines,
    hasJsonLogs,
  }: {
    logs: string[];
    hasJsonLogs: boolean;
  }) {
    setHasJsonLogs(hasJsonLogs);

    const displayLogs = logLines.map(logEntry => {
      if (prettifyLogs && hasJsonLogs) {
        return colorizePrettifiedLog(logEntry);
      }
      return logEntry;
    });

    setLogs(current => {
      if (current.lastLineShown >= logLines.length) {
        xtermRef.current?.clear();
        xtermRef.current?.write(displayLogs.join('').replaceAll('\n', '\r\n'));
      } else {
        xtermRef.current?.write(
          displayLogs
            .slice(current.lastLineShown + 1)
            .join('')
            .replaceAll('\n', '\r\n')
        );
      }

      return {
        logs: logLines,
        lastLineShown: logLines.length - 1,
      };
    });

    // If we stopped following the logs and we have logs already,
    // then we don't need to fetch them again.
    if (!follow && logs.logs.length > 0) {
      xtermRef.current?.write(
        '\n\n' +
          t('translation|Logs are paused. Click the follow button to resume following them.') +
          '\r\n'
      );
      return;
    }
  }

  const debouncedSetState = _.debounce(setLogsDebounced, 500, options);

  React.useEffect(
    () => {
      let callback: any = null;

      if (props.open) {
        xtermRef.current?.clear();
        setLogs({ logs: [], lastLineShown: -1 });
        setHasJsonLogs(false);

        callback = item.getLogs(container, debouncedSetState, {
          tailLines: lines,
          showPrevious,
          showTimestamps,
          follow,
          prettifyLogs,
          formatJsonValues,
          /**
           * When the connection is lost, show the reconnect button.
           * This will stop the current log stream.
           */
          onReconnectStop: () => {
            setShowReconnectButton(true);
          },
        });
      }

      return function cleanup() {
        if (callback) {
          callback();
        }
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [container, lines, open, showPrevious, showTimestamps, follow, prettifyLogs, formatJsonValues]
  );

  function handleContainerChange(event: any) {
    setContainer(event.target.value);
    setHasJsonLogs(false);
  }

  function handleLinesChange(event: any) {
    setLines(event.target.value);
  }

  function handlePreviousChange() {
    setShowPrevious(previous => !previous);
  }

  function hasContainerRestarted() {
    const cont = item?.status?.containerStatuses?.find(
      (c: KubeContainerStatus) => c.name === container
    );
    if (!cont) {
      return false;
    }

    return cont.restartCount > 0;
  }

  function handleTimestampsChange() {
    setShowTimestamps(timestamps => !timestamps);
  }

  function handleFollowChange() {
    setFollow(follow => !follow);
  }

  function handlePrettifyChange() {
    setPrettifyLogs(prettify => !prettify);
  }

  function handleFormatJsonValuesChange() {
    setFormatJsonValues(format => !format);
  }

  /**
   * Handle the reconnect button being clicked.
   * This will start a new log stream and hide the reconnect button.
   */
  function handleReconnect() {
    // If there's an existing log stream, cancel it
    if (cancelLogsStream) {
      cancelLogsStream();
    }

    // Start a new log stream
    const newCancelLogsStream = item.getLogs(container, debouncedSetState, {
      tailLines: lines,
      showPrevious,
      showTimestamps,
      follow,
      prettifyLogs,
      formatJsonValues,
      /**
       * When the connection is lost, show the reconnect button.
       * This will stop the current log stream.
       */
      onReconnectStop: () => {
        setShowReconnectButton(true);
      },
    });

    // Set the cancelLogsStream function to the new one
    setCancelLogsStream(() => newCancelLogsStream);

    // Hide the reconnect button
    setShowReconnectButton(false);
  }

  return (
    <LogViewer
      title={t('glossary|Logs: {{ itemName }}', { itemName: item.getName() })}
      downloadName={`${item.getName()}_${container}`}
      open={open}
      onClose={onClose}
      logs={logs.logs}
      xtermRef={xtermRef}
      handleReconnect={handleReconnect}
      showReconnectButton={showReconnectButton}
      topActions={[
        <FormControl sx={{ minWidth: '11rem' }}>
          <InputLabel shrink id="container-name-chooser-label">
            {t('glossary|Container')}
          </InputLabel>
          <Select
            labelId="container-name-chooser-label"
            id="container-name-chooser"
            value={container}
            onChange={handleContainerChange}
          >
            {item?.spec?.containers && (
              <MenuItem disabled value="">
                {t('glossary|Containers')}
              </MenuItem>
            )}
            {item?.spec?.containers.map(({ name }) => (
              <MenuItem value={name} key={name}>
                {name}
              </MenuItem>
            ))}
            {item?.spec?.initContainers && (
              <MenuItem disabled value="">
                {t('translation|Init Containers')}
              </MenuItem>
            )}
            {item.spec.initContainers?.map(({ name }) => (
              <MenuItem value={name} key={`init_container_${name}`}>
                {name}
              </MenuItem>
            ))}
            {item?.spec?.ephemeralContainers && (
              <MenuItem disabled value="">
                {t('glossary|Ephemeral Containers')}
              </MenuItem>
            )}
            {item.spec.ephemeralContainers?.map(({ name }) => (
              <MenuItem value={name} key={`eph_container_${name}`}>
                {name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>,
        <FormControl sx={{ minWidth: '6rem' }}>
          <InputLabel shrink id="container-lines-chooser-label">
            {t('translation|Lines')}
          </InputLabel>
          <Select
            labelId="container-lines-chooser-label"
            id="container-lines-chooser"
            value={lines}
            onChange={handleLinesChange}
          >
            {[100, 1000, 2500].map(i => (
              <MenuItem value={i} key={i}>
                {i}
              </MenuItem>
            ))}
            <MenuItem value={-1}>All</MenuItem>
          </Select>
        </FormControl>,
        <LightTooltip
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
        </LightTooltip>,
        <PaddedFormControlLabel
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
        hasJsonLogs && (
          <PaddedFormControlLabel
            label={t('translation|Prettify')}
            control={
              <Switch
                checked={prettifyLogs}
                onChange={handlePrettifyChange}
                name="prettifyLogs"
                color="primary"
                size="small"
                sx={{ transform: 'scale(0.8)' }}
              />
            }
          />
        ),
        hasJsonLogs && (
          <LightTooltip
            title={t('translation|Show JSON values in plain text by removing escape characters.')}
          >
            <PaddedFormControlLabel
              label={t('translation|Format')}
              control={
                <Switch
                  checked={formatJsonValues}
                  onChange={handleFormatJsonValuesChange}
                  name="formatJsonValues"
                  color="primary"
                  size="small"
                  sx={{ transform: 'scale(0.8)' }}
                />
              }
            />
          </LightTooltip>
        ),
      ].filter(Boolean)}
      {...other}
    />
  );
}

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
            getter: data => Object.keys(data)[1],
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
          {
            label: t('translation|Key'),
            getter: data => data.key,
          },
          {
            label: t('translation|Value'),
            getter: data => data.value,
          },
          {
            label: t('translation|Operator'),
            getter: data => data.operator,
            gridTemplate: '0.5fr',
          },
          {
            label: t('translation|Effect'),
            getter: data => data.effect,
          },
          {
            label: t('Seconds'),
            getter: data => data.tolerationSeconds,
            gridTemplate: '0.5fr',
          },
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
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation('glossary');
  const dispatchHeadlampEvent = useEventCallback();

  function prepareExtraInfo(item: Pod | null) {
    let extraInfo: {
      name: string;
      value: React.ReactNode;
      hideLabel?: boolean;
    }[] = [];
    if (item) {
      extraInfo = [
        {
          name: t('State'),
          value: makePodStatusLabel(item, false),
        },
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
            !!item.spec.serviceAccountName || !!item.spec.serviceAccount ? (
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
        // Show Host IP only if Host IPs doesn't exist or is empty
        ...(item.status.hostIPs && item.status.hostIPs.length > 0
          ? []
          : [
              {
                name: t('Host IP'),
                value: item.status.hostIP ?? '',
              },
            ]),
        // Always include Host IPs, but hide if empty
        {
          name: t('Host IPs'),
          value: item.status.hostIPs
            ? item.status.hostIPs.map((ipObj: { ip: string }) => ipObj.ip).join(', ')
            : '',
          hideLabel: !item.status.hostIPs || item.status.hostIPs.length === 0,
        },
        // Show Pod IP only if Pod IPs doesn't exist or is empty
        ...(item.status.podIPs && item.status.podIPs.length > 0
          ? []
          : [
              {
                name: t('Pod IP'),
                value: item.status.podIP ?? '',
              },
            ]),
        // Always include Pod IPs, but hide if empty
        {
          name: t('Pod IPs'),
          value: item.status.podIPs
            ? item.status.podIPs.map((ipObj: { ip: string }) => ipObj.ip).join(', ')
            : '',
          hideLabel: !item.status.podIPs || item.status.podIPs.length === 0,
        },
        {
          name: t('QoS Class'),
          value: item.status.qosClass,
        },
        {
          name: t('Priority'),
          value: item.spec.priority,
        },
      ];
    }
    return extraInfo;
  }

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
                  icon="mdi:file-document-box-outline"
                  onClick={() => {
                    Activity.launch({
                      id: 'logs-' + item.metadata.uid,
                      title: t('Logs') + ': ' + item.metadata.name,
                      cluster: item.cluster,
                      icon: (
                        <Icon icon="mdi:file-document-box-outline" width="100%" height="100%" />
                      ),
                      location: 'full',
                      content: <PodLogViewer noDialog open item={item} onClose={() => {}} />,
                    });
                    dispatchHeadlampEvent({
                      type: HeadlampEventType.LOGS,
                      data: {
                        status: EventStatus.OPENED,
                      },
                    });
                  }}
                />
              </AuthVisible>
            ),
          },
          {
            id: DefaultHeaderAction.POD_TERMINAL,
            action: (
              <AuthVisible item={item} authVerb="create" subresource="exec">
                <ActionButton
                  description={t('Terminal / Exec')}
                  icon="mdi:console"
                  onClick={() => {
                    Activity.launch({
                      id: 'terminal-' + item.metadata.uid,
                      title: item.metadata.name,
                      cluster: item.cluster,
                      icon: <Icon icon="mdi:console" width="100%" height="100%" />,
                      location: 'full',
                      content: (
                        <Terminal noDialog open item={item} onClose={() => {}} isAttach={false} />
                      ),
                    });
                    dispatchHeadlampEvent({
                      type: HeadlampEventType.TERMINAL,
                      data: {
                        resource: item,
                        status: EventStatus.CLOSED,
                      },
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
                  icon="mdi:connection"
                  onClick={() => {
                    dispatchHeadlampEvent({
                      type: HeadlampEventType.POD_ATTACH,
                      data: {
                        resource: item,
                        status: EventStatus.OPENED,
                      },
                    });
                    Activity.launch({
                      id: 'attach-' + item.metadata.uid,
                      title: item.metadata.name,
                      cluster: item.cluster,
                      icon: <Icon icon="mdi:console" width="100%" height="100%" />,
                      location: 'full',
                      content: <Terminal noDialog open item={item} onClose={() => {}} isAttach />,
                    });
                  }}
                />
              </AuthVisible>
            ),
          },
        ]
      }
      extraInfo={item => prepareExtraInfo(item)}
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
          {
            id: 'headlamp.pod-volumes',
            section: <VolumeSection resource={item?.jsonData} />,
          },
        ]
      }
    />
  );
}

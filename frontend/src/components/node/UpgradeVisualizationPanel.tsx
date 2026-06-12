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
import Chip from '@mui/material/Chip';
import { green } from '@mui/material/colors';
import Paper from '@mui/material/Paper';
import Step from '@mui/material/Step';
import StepConnector, { stepConnectorClasses } from '@mui/material/StepConnector';
import { StepIconProps } from '@mui/material/StepIcon';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import { styled, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Event from '../../lib/k8s/event';
import Node from '../../lib/k8s/node';
import { hasAKSManagedNodes, useIsUpgradeDetected } from './upgradeDetection';
import {
  buildNodeUpgradeStates,
  NodeUpgradeState,
  UPGRADE_STAGES,
  UpgradeStage,
} from './upgradeState';

function getStageLabelTranslated(stage: UpgradeStage, t: (key: string) => string): string {
  switch (stage) {
    case 'cordon':
      return t('Cordon');
    case 'drain':
      return t('Drain');
    case 'deleteNode':
      return t('Delete');
    case 'reimage':
      return t('Reimage');
    case 'completed':
      return t('Complete');
  }
}

/**
 * Iconify icon names for each stage.
 */
const STAGE_ICONS: Record<UpgradeStage, string> = {
  cordon: 'mdi:lock',
  drain: 'mdi:clipboard-arrow-down',
  deleteNode: 'mdi:delete',
  reimage: 'mdi:timer-sand',
  completed: 'mdi:check-circle',
};

/**
 * Format a timestamp string to a locale time string like "09:36:43 AM".
 */
function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const successBgColor = green[800]; // #2e7d32 — dark green, works in both modes

function useActiveBgColor() {
  const theme = useTheme();
  return theme.palette.mode === 'dark' ? green[500] : theme.palette.primary.main;
}

/**
 * Custom connector line between steps — green when completed or active, grey otherwise.
 */
const UpgradeStepConnector = styled(StepConnector)(({ theme }) => ({
  [`&.${stepConnectorClasses.completed}`]: {
    [`& .${stepConnectorClasses.line}`]: {
      borderColor: successBgColor,
    },
  },
  [`&.${stepConnectorClasses.active}`]: {
    [`& .${stepConnectorClasses.line}`]: {
      borderColor: successBgColor,
    },
  },
  [`& .${stepConnectorClasses.line}`]: {
    borderColor: theme.palette.grey[400],
    borderTopWidth: 3,
    borderRadius: 1,
  },
}));

/**
 * Custom step icon component that renders an Iconify icon inside a colored circle.
 */
function UpgradeStepIcon(props: StepIconProps & { stage: UpgradeStage; isFailed: boolean }) {
  const { active, completed, stage, isFailed } = props;
  const theme = useTheme();
  const activeBg = useActiveBgColor();
  const successBg = successBgColor;

  let bgColor = theme.palette.grey[400];
  const iconColor = '#fff';

  if (isFailed) {
    bgColor = theme.palette.error.main;
  } else if (completed) {
    bgColor = successBg;
  } else if (active) {
    bgColor = activeBg;
  }

  return (
    <Box
      sx={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        backgroundColor: bgColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: active ? `0 0 0 4px ${bgColor}40` : 'none',
      }}
    >
      <Icon icon={STAGE_ICONS[stage]} width={22} height={22} color={iconColor} />
    </Box>
  );
}

/**
 * Renders the upgrade stepper for a single upgrading node.
 */
function NodeUpgradeStepper({ state, node }: { state: NodeUpgradeState; node: Node | undefined }) {
  const { t } = useTranslation(['translation']);
  const theme = useTheme();
  const activeBg = useActiveBgColor();
  const successBg = successBgColor;

  const activeStepIndex = state.currentStage ? UPGRADE_STAGES.indexOf(state.currentStage) : -1;

  const failedStepIndex = state.failedStage ? UPGRADE_STAGES.indexOf(state.failedStage) : -1;

  const isReady = node?.status?.conditions?.find(c => c.type === 'Ready')?.status === 'True';
  const version = node?.status?.nodeInfo?.kubeletVersion;

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      {/* Header: node name + Ready badge + version */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
            {state.nodeName}
          </Typography>
          {isReady && <Chip label={t('Ready')} size="small" color="success" variant="outlined" />}
        </Box>
        {version && (
          <Typography variant="body2" sx={{ color: theme.palette.primary.main, fontWeight: 500 }}>
            {t('Version: {{ version }}', { version })}
          </Typography>
        )}
      </Box>

      {/* Stepper */}
      <Stepper activeStep={activeStepIndex} alternativeLabel connector={<UpgradeStepConnector />}>
        {UPGRADE_STAGES.map((stage, index) => {
          const isFailed = index === failedStepIndex;
          const isCompleted =
            index < activeStepIndex ||
            (stage === 'completed' && state.currentStage === 'completed');
          const isActive = index === activeStepIndex;
          const timestamp = state.stageTimestamps[stage];

          return (
            <Step key={stage} completed={isCompleted}>
              <StepLabel
                error={isFailed}
                StepIconComponent={(iconProps: StepIconProps) => (
                  <UpgradeStepIcon
                    {...iconProps}
                    stage={stage}
                    isFailed={isFailed}
                    completed={isCompleted}
                    active={isActive}
                  />
                )}
                optional={
                  isFailed && state.failureMessage ? (
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        maxWidth: 200,
                        wordBreak: 'break-word',
                        whiteSpace: 'normal',
                        textAlign: 'center',
                      }}
                    >
                      {state.failureMessage}
                    </Typography>
                  ) : timestamp ? (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', textAlign: 'center' }}
                    >
                      {formatTimestamp(timestamp)}
                    </Typography>
                  ) : undefined
                }
                sx={{
                  '& .MuiStepLabel-label': {
                    fontWeight: isActive ? 'bold' : 'normal',
                    mt: 0.5,
                    ...(isCompleted &&
                      !isFailed && {
                        color: `${successBg} !important`,
                      }),
                    ...(isFailed && {
                      color: `${theme.palette.error.main} !important`,
                    }),
                    ...(isActive &&
                      !isFailed && {
                        color: `${activeBg} !important`,
                      }),
                  },
                }}
              >
                {getStageLabelTranslated(stage, t)}
              </StepLabel>
            </Step>
          );
        })}
      </Stepper>
    </Paper>
  );
}

/**
 * Renders a single non-upgrading node row with Ready badge and version.
 */
function NodeIdleRow({ state, node }: { state: NodeUpgradeState; node: Node | undefined }) {
  const { t } = useTranslation(['translation']);
  const isReady = node?.status?.conditions?.find(c => c.type === 'Ready')?.status === 'True';
  const version = node?.status?.nodeInfo?.kubeletVersion;

  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, mb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="subtitle2">{state.nodeName}</Typography>
        {isReady && <Chip label={t('Ready')} size="small" color="success" variant="outlined" />}
        {state.isSurge && <Chip label={t('Surge Node')} size="small" color="info" />}
      </Box>
      {version && (
        <Typography variant="body2" sx={{ color: 'primary.main', fontWeight: 500 }}>
          {t('Version: {{ version }}', { version })}
        </Typography>
      )}
    </Paper>
  );
}

/**
 * Upgrade Visualization Panel.
 * Shown below the node list table when an upgrade is detected.
 * Gates on AKS-managed nodes so non-AKS clusters never pay the event-fetch cost.
 */
export default function UpgradeVisualizationPanel() {
  const { items: nodes } = Node.useList();

  const isAKSCluster = useMemo(() => {
    if (!nodes) return false;
    return hasAKSManagedNodes(nodes);
  }, [nodes]);

  if (!isAKSCluster) {
    return null;
  }

  return <UpgradeVisualizationPanelInner nodes={nodes!} />;
}

/**
 * Inner panel that fetches events and renders upgrade progress.
 * Only mounted when AKS nodes are detected.
 */
function UpgradeVisualizationPanelInner({ nodes }: { nodes: Node[] }) {
  const upgradeDetected = useIsUpgradeDetected();

  if (!upgradeDetected) {
    return null;
  }

  return <UpgradeVisualizationPanelContent nodes={nodes} />;
}

/**
 * Content panel that fetches Node events and renders upgrade steppers.
 * Only mounted when an upgrade is detected, so the Node event fetch
 * is avoided on idle AKS clusters.
 */
function UpgradeVisualizationPanelContent({ nodes }: { nodes: Node[] }) {
  const { t } = useTranslation(['translation']);

  // fetch for all Node events to buildNodeUpgradeStates
  const { items: nodeEvents } = Event.useList({
    limit: Event.maxLimit,
    fieldSelector: 'involvedObject.kind=Node',
  });

  const nodeStates = useMemo(() => {
    if (!nodes || !nodeEvents) return new Map<string, NodeUpgradeState>();
    return buildNodeUpgradeStates(nodes, nodeEvents);
  }, [nodes, nodeEvents]);

  // Build a lookup map from node name to Node object
  const nodeMap = new Map<string, Node>();
  for (const node of nodes) {
    const name = node.metadata.name;
    if (!name) continue;
    nodeMap.set(name, node);
  }

  const states = Array.from(nodeStates.values());
  const upgradingNodes = states.filter(
    s => s.isUpgrading && !s.isSurge && s.currentStage !== 'completed'
  );
  const surgeNodes = states.filter(s => s.isSurge && nodeMap.has(s.nodeName));
  const idleNodes = states.filter(
    s =>
      ((!s.isUpgrading && !s.isSurge) || s.currentStage === 'completed') && nodeMap.has(s.nodeName)
  );

  return (
    <Box sx={{ mt: 2, ml: 1, mr: 1 }}>
      {/* Upgrading nodes with steppers */}
      {upgradingNodes.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>
            {t('Upgrading Nodes')}
          </Typography>
          {upgradingNodes.map(state => (
            <NodeUpgradeStepper
              key={state.nodeName}
              state={state}
              node={nodeMap.get(state.nodeName)}
            />
          ))}
        </Box>
      )}

      {/* Surge nodes */}
      {surgeNodes.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>
            {t('Surge Nodes')}
          </Typography>
          {surgeNodes.map(state => (
            <NodeIdleRow key={state.nodeName} state={state} node={nodeMap.get(state.nodeName)} />
          ))}
        </Box>
      )}

      {/* Idle (non-upgrading) nodes */}
      {idleNodes.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>
            {t('Idle Nodes')}
          </Typography>
          {idleNodes.map(state => (
            <NodeIdleRow key={state.nodeName} state={state} node={nodeMap.get(state.nodeName)} />
          ))}
        </Box>
      )}
    </Box>
  );
}

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
import Fade from '@mui/material/Fade';
import { KubeContainerStatus } from '../../lib/k8s/cluster';
import Pod from '../../lib/k8s/pod';
import { StatusLabel, StatusLabelProps } from '../common/Label';
import LightTooltip from '../common/Tooltip/TooltipLight';

function getPodStatus(pod: Pod) {
  const phase = pod.status?.phase;
  let status: StatusLabelProps['status'] = '';

  if (phase === 'Failed') {
    status = 'error';
  } else if (phase === 'Succeeded' || phase === 'Running') {
    const readyCondition = (pod.status?.conditions || []).find(
      condition => condition.type === 'Ready'
    );
    if (readyCondition?.status === 'True' || phase === 'Succeeded') {
      status = 'success';
    } else {
      status = 'warning';
    }
  }

  return status;
}

function getContainerDisplayStatus(container: KubeContainerStatus) {
  const state = container.state || {};
  let color = 'grey';
  let label = '';
  const tooltipLines: string[] = [`Name: ${container.name}`];

  if (state.waiting) {
    color = 'orange';
    label = 'Waiting';
    if (state.waiting.reason) {
      tooltipLines.push(`Reason: ${state.waiting.reason}`);
    }
  } else if (state.terminated) {
    color = 'green';
    label = 'Terminated';
    if (state.terminated.reason === 'Error') {
      color = 'red';
    }
    if (state.terminated.reason) {
      tooltipLines.push(`Reason: ${state.terminated.reason}`);
    }
    if (state.terminated.exitCode !== undefined) {
      tooltipLines.push(`Exit Code: ${state.terminated.exitCode}`);
    }
    if (state.terminated.startedAt) {
      tooltipLines.push(`Started: ${new Date(state.terminated.startedAt).toLocaleString()}`);
    }
    if (state.terminated.finishedAt) {
      tooltipLines.push(`Finished: ${new Date(state.terminated.finishedAt).toLocaleString()}`);
    }
    if (container.restartCount > 0) {
      tooltipLines.push(`Restarts: ${container.restartCount}`);
    }
  } else if (state.running) {
    color = 'green';
    label = 'Running';
    if (state.running.startedAt) {
      tooltipLines.push(`Started: ${new Date(state.running.startedAt).toLocaleString()}`);
    }
    if (container.restartCount > 0) {
      tooltipLines.push(`Restarts: ${container.restartCount}`);
    }
  }

  tooltipLines.splice(1, 0, `Status: ${label}`);

  return {
    color,
    label,
    tooltip: <span style={{ whiteSpace: 'pre-line' }}>{tooltipLines.join('\n')}</span>,
  };
}

export function makePodStatusLabel(pod: Pod, showContainerStatus: boolean = true) {
  const status = getPodStatus(pod);
  const { reason, message: tooltip } = pod.getDetailedStatus();

  const containerStatuses = pod.status?.containerStatuses || [];
  const containerIndicators = containerStatuses.map(cs => {
    const { color, tooltip } = getContainerDisplayStatus(cs);
    return (
      <LightTooltip
        title={tooltip}
        key={cs.name}
        TransitionComponent={Fade}
        TransitionProps={{ timeout: 0 }}
        slotProps={{
          popper: {
            modifiers: [{ name: 'computeStyles', options: { gpuAcceleration: false } }],
          },
          tooltip: { sx: { maxWidth: 'none', willChange: 'opacity' } },
        }}
      >
        <Icon icon="mdi:circle" style={{ color }} width="1rem" height="1rem" />
      </LightTooltip>
    );
  });

  return (
    <Box display="flex" alignItems="center" gap={1}>
      <LightTooltip
        title={tooltip}
        interactive
        TransitionComponent={Fade}
        TransitionProps={{ timeout: 0 }}
        slotProps={{
          popper: {
            modifiers: [{ name: 'computeStyles', options: { gpuAcceleration: false } }],
          },
          tooltip: { sx: { maxWidth: 'none', willChange: 'opacity' } },
        }}
      >
        <Box display="inline">
          <StatusLabel status={status}>
            {(status === 'warning' || status === 'error') && (
              <Icon
                aria-hidden="true"
                role="presentation"
                icon="mdi:alert-outline"
                width="1.2rem"
                height="1.2rem"
              />
            )}
            {reason}
          </StatusLabel>
        </Box>
      </LightTooltip>
      {showContainerStatus && containerIndicators.length > 0 && (
        <Box display="flex" gap={0.5}>
          {containerIndicators}
        </Box>
      )}
    </Box>
  );
}

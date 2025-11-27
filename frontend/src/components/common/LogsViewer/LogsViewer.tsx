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

import { Box, Checkbox, FormControlLabel, MenuItem, TextField } from '@mui/material';
import { useMemo, useState } from 'react';
import { Trans } from 'react-i18next';
import { useDeploymentLogs, usePodLogs } from '../../../lib/k8s/api/v2/fetchLogs';
import { KubeContainer } from '../../../lib/k8s/cluster';
import Deployment from '../../../lib/k8s/deployment';
import Pod from '../../../lib/k8s/pod';
import type ReplicaSet from '../../../lib/k8s/replicaSet';
import { ClusterGroupErrorMessage } from '../../cluster/ClusterGroupErrorMessage';
import { useLocalStorageState } from '../../globalSearch/useLocalStorageState';
import { LogDisplay } from './LogDisplay';
import { useParsedLogs } from './ParsedLog';
import { SeveritySelector } from './SeveritySelector';

/** Display logs for a workload instance */
export function LogsViewer({
  item,
  defaultSeverities,
}: {
  item: Pod | Deployment | ReplicaSet;
  defaultSeverities?: string[];
}) {
  const containers: KubeContainer[] =
    item.kind === 'Pod' ? item.spec.containers : item.spec.template.spec.containers;
  const [severityFilter, setSeverityFilter] = useState<Set<string> | undefined>(
    defaultSeverities ? new Set(defaultSeverities) : undefined
  );
  const [showTimestamps, setShowtimestamps] = useLocalStorageState(
    'logs-viewer-show-timestamps',
    true
  );
  const [showSeverity, setShowSeverity] = useLocalStorageState('logs-viewer-show-severity', false);
  const [textWrap, setTextWrap] = useLocalStorageState('logs-viewer-text-wrap', true);
  const [container, setContainer] = useState(containers[0].name);
  const [lines, setLines] = useState(100);
  const { logs: rawLogs, error: logsError } = (
    item.kind === 'Pod' ? usePodLogs : useDeploymentLogs
  )({
    item: item as Pod & Deployment,
    container,
    lines,
  });

  const parsed = useParsedLogs(rawLogs);
  const filtered = useMemo(
    () => (severityFilter ? parsed.filter(it => severityFilter.has(it.severity)) : parsed),
    [parsed, severityFilter]
  );

  const logs = filtered;

  return (
    <>
      <Box
        sx={theme => ({
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1,
          borderBottom: '1px solid',
          borderColor: theme.palette.divider,
          flexWrap: 'wrap',
        })}
      >
        {containers.length > 1 && (
          <TextField
            select
            size="small"
            variant="outlined"
            onChange={e => setContainer(e.target.value)}
            value={container}
            label={<Trans>Container</Trans>}
          >
            {containers.map(c => (
              <MenuItem key={c.name} value={c.name}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
        )}

        <TextField
          select
          size="small"
          variant="outlined"
          onChange={e => setLines(Number(e.target.value))}
          value={lines}
          label={<Trans>Lines</Trans>}
        >
          {[100, 1000, 2500].map(l => (
            <MenuItem key={l} value={l}>
              {l}
            </MenuItem>
          ))}
        </TextField>

        <SeveritySelector
          logs={parsed}
          severityFilter={severityFilter}
          setSeverityFilter={setSeverityFilter}
        />

        <FormControlLabel
          sx={{ m: 0 }}
          control={
            <Checkbox
              size="small"
              onChange={e => setShowSeverity(() => Boolean(e.target.checked))}
              checked={showSeverity}
            />
          }
          label={<Trans>Severity</Trans>}
        />

        <FormControlLabel
          sx={{ m: 0 }}
          control={
            <Checkbox
              size="small"
              onChange={e => setShowtimestamps(() => Boolean(e.target.checked))}
              checked={showTimestamps}
            />
          }
          label={<Trans>Timestamps</Trans>}
        />

        <FormControlLabel
          sx={{ m: 0 }}
          control={
            <Checkbox
              size="small"
              onChange={e => setTextWrap(() => Boolean(e.target.checked))}
              checked={textWrap}
            />
          }
          label={<Trans>Wrap lines</Trans>}
        />
      </Box>
      {logsError && <ClusterGroupErrorMessage errors={[logsError]} />}
      <LogDisplay
        logs={logs}
        severityFilter={severityFilter}
        showSeverity={showSeverity}
        showTimestamps={showTimestamps}
        textWrap={textWrap}
      />
    </>
  );
}

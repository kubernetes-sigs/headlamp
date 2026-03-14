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
import { Box, Button, Checkbox, FormControlLabel, MenuItem, TextField } from '@mui/material';
import { useMemo, useState } from 'react';
import { Trans } from 'react-i18next';
import { usePodLogs, useWorkloadLogs } from '../../../lib/k8s/api/v2/fetchLogs';
import type { KubeContainer } from '../../../lib/k8s/cluster';
import type DaemonSet from '../../../lib/k8s/daemonSet';
import Deployment from '../../../lib/k8s/deployment';
import Pod from '../../../lib/k8s/pod';
import type ReplicaSet from '../../../lib/k8s/replicaSet';
import type StatefulSet from '../../../lib/k8s/statefulSet';
import { ClusterGroupErrorMessage } from '../../cluster/ClusterGroupErrorMessage';
import { useLocalStorageState } from '../../globalSearch/useLocalStorageState';
import TooltipLight from '../Tooltip/TooltipLight';
import { LogDisplay } from './LogDisplay';
import { type ParsedLog, useParsedLogs } from './ParsedLog';
import { SeveritySelector } from './SeveritySelector';

/** Calculate counts for each severity */
const useSeverityStats = (logs: ParsedLog[]) => {
  return useMemo(() => {
    const stats = new Map<string, number>();

    logs.forEach(({ severity }) => {
      const current = stats.get(severity) ?? 0;
      stats.set(severity, current + 1);
    });

    return stats;
  }, [logs]);
};

/** Display logs for a workload instance */
export function LogsViewer({
  item,
  defaultSeverities,
}: {
  item: Pod | Deployment | ReplicaSet | DaemonSet | StatefulSet;
  defaultSeverities?: string[];
}) {
  const spec = item.kind === 'Pod' ? item.spec : item.spec.template.spec;
  const containers: KubeContainer[] = [...(spec.initContainers ?? []), ...spec.containers];
  const [severityFilter, setSeverityFilter] = useState<Set<string> | undefined>(
    defaultSeverities ? new Set(defaultSeverities) : undefined
  );
  const [showTimestamps, setShowtimestamps] = useLocalStorageState(
    'logs-viewer-show-timestamps',
    true
  );
  const [showSeverity, setShowSeverity] = useLocalStorageState('logs-viewer-show-severity', false);
  const [textWrap, setTextWrap] = useLocalStorageState('logs-viewer-text-wrap', true);
  const [showPrevious, setShowPrevious] = useState(false);
  const [container, setContainer] = useState(containers[0].name);
  const [lines, setLines] = useState<number | 'All'>(100);
  const { logs: rawLogs, error: logsError } = (item.kind === 'Pod' ? usePodLogs : useWorkloadLogs)({
    item: item as Pod & Deployment,
    container,
    lines: lines === 'All' ? undefined : lines,
    previous: showPrevious,
  });

  const parsedLogs = useParsedLogs(rawLogs);
  const logs = useMemo(
    () => (severityFilter ? parsedLogs.filter(it => severityFilter.has(it.severity)) : parsedLogs),
    [parsedLogs, severityFilter]
  );

  const severityStats = useSeverityStats(parsedLogs);

  /** Format and download logs in plaintext */
  function handleDownload() {
    const time = new Date().toISOString().replace(/:/g, '-').slice(0, -5);
    const element = document.createElement('a');
    const file = new Blob(
      [
        logs
          .map(it =>
            [
              item.kind !== 'Pod' && it.pod ? `[${it.pod}]` : undefined,
              showTimestamps ? it.timestamp : undefined,
              showSeverity ? it.severity : undefined,
              it.content,
            ]
              .filter(Boolean)
              .join(' ')
          )
          .join('\n'),
      ],
      { type: 'text/plain' }
    );
    element.href = URL.createObjectURL(file);
    element.download = item.metadata.name + `_log_${time}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }

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
          onChange={e => setLines(e.target.value === 'All' ? 'All' : Number(e.target.value))}
          value={lines}
          label={<Trans>Lines</Trans>}
        >
          {[100, 1000, 2500, 'All'].map(l => (
            <MenuItem key={l} value={l}>
              {l}
            </MenuItem>
          ))}
        </TextField>

        <SeveritySelector
          severityStats={severityStats}
          severities={severityFilter}
          setSeverities={setSeverityFilter}
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

        <TooltipLight title={<Trans>Show logs for previous instances of this container.</Trans>}>
          <FormControlLabel
            sx={{ m: 0 }}
            control={
              <Checkbox
                size="small"
                onChange={e => setShowPrevious(() => Boolean(e.target.checked))}
                checked={showPrevious}
              />
            }
            label={<Trans>Previous</Trans>}
          />
        </TooltipLight>

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

        <Button
          startIcon={<Icon icon="mdi:download" />}
          variant="contained"
          color="secondary"
          sx={{ ml: 'auto' }}
          onClick={handleDownload}
          size="small"
        >
          <Trans>Download</Trans>
        </Button>
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

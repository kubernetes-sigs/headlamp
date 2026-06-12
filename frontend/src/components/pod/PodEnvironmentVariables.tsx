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
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useSnackbar } from 'notistack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveContainerName } from '../../helpers/podContainer';
import Pod from '../../lib/k8s/pod';
import EmptyContent from '../common/EmptyContent';
import Loader from '../common/Loader';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

/**
 * One resolved environment entry as seen inside a running container.
 */
export interface PodEnvironmentEntry {
  name: string;
  value: string;
}

interface PodEnvironmentVariablesProps {
  item: Pod;
  initialContainer?: string;
  onClose?: () => void;
}

type ExecStream = ReturnType<Pod['exec']>;

const STDOUT_CHANNEL = 1;
const STDERR_CHANNEL = 2;
const SERVER_STATUS_CHANNEL = 3;
const EXEC_TIMEOUT_MS = 15000;

const decoder = new TextDecoder('utf-8');

/**
 * Parses `KEY=VALUE` lines emitted by `env` / `printenv`.
 *
 * Values may legally contain `=` characters, so we split on the first one only
 * and preserve the rest verbatim.
 */
export function parseEnvOutput(stdout: string): PodEnvironmentEntry[] {
  const rows: PodEnvironmentEntry[] = [];
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) {
      rows.push({ name: line, value: '' });
      continue;
    }
    rows.push({ name: line.slice(0, eqIdx), value: line.slice(eqIdx + 1) });
  }
  return rows;
}

/**
 * Parses the null-separated stream produced by `cat /proc/1/environ`.
 *
 * This is the fallback path for minimal / distroless images that ship without
 * an `env` binary on PATH.
 */
export function parseProcEnviron(stdout: string): PodEnvironmentEntry[] {
  const rows: PodEnvironmentEntry[] = [];
  for (const entry of stdout.split('\0')) {
    if (!entry) continue;
    const eqIdx = entry.indexOf('=');
    if (eqIdx === -1) {
      rows.push({ name: entry, value: '' });
      continue;
    }
    rows.push({ name: entry.slice(0, eqIdx), value: entry.slice(eqIdx + 1) });
  }
  return rows;
}

interface ExecOutcome {
  stdout: string;
  stderr: string;
  exitOk: boolean;
}

/**
 * Pod details panel that fetches and displays the fully resolved environment
 * variables of a running container, so users can verify values coming from
 * Secrets, ConfigMaps or downward API without having to open a shell.
 */
export function PodEnvironmentVariables(props: PodEnvironmentVariablesProps) {
  const { item, initialContainer, onClose } = props;
  const { t } = useTranslation(['translation', 'glossary']);
  const { enqueueSnackbar } = useSnackbar();

  const [container, setContainer] = useState<string>(() =>
    resolveContainerName(item, initialContainer)
  );
  const [rows, setRows] = useState<PodEnvironmentEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealAll, setRevealAll] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState('');
  const execRef = useRef<ExecStream | null>(null);
  const requestIdRef = useRef(0);

  const containerOptions = useMemo(
    () => [
      ...(item.spec?.containers ?? []).map(c => ({ name: c.name, kind: 'container' as const })),
      ...(item.spec?.initContainers ?? []).map(c => ({ name: c.name, kind: 'init' as const })),
      ...(item.spec?.ephemeralContainers ?? []).map(c => ({
        name: c.name,
        kind: 'ephemeral' as const,
      })),
    ],
    [item]
  );

  const isContainerRunning = useMemo(() => {
    const allStatuses = [
      ...(item.status?.containerStatuses ?? []),
      ...(item.status?.initContainerStatuses ?? []),
      ...(item.status?.ephemeralContainerStatuses ?? []),
    ];
    return allStatuses.some(s => s.name === container && s.state?.running);
  }, [item, container]);

  const runExec = useCallback(
    (command: string[], requestId: number) =>
      new Promise<ExecOutcome>((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        let settled = false;
        let localExec: ExecStream | null = null;

        const finish = (cb: () => void) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          // Only clear the shared ref if this call still owns it; a newer
          // request may have replaced it already.
          if (execRef.current === localExec) {
            execRef.current = null;
          }
          cb();
        };

        const timer = window.setTimeout(() => {
          finish(() => {
            localExec?.cancel();
            reject(new Error(t('translation|Timed out waiting for environment output.')));
          });
        }, EXEC_TIMEOUT_MS);

        const onData = (bytes: ArrayBuffer) => {
          // Drop late chunks from a superseded request to avoid stale results
          // winning over the newer in-flight one.
          if (requestId !== requestIdRef.current) return;
          const channel = new Int8Array(bytes.slice(0, 1))[0];
          const text = decoder.decode(bytes.slice(1));
          if (channel === STDOUT_CHANNEL) {
            stdout += text;
            return;
          }
          if (channel === STDERR_CHANNEL) {
            stderr += text;
            return;
          }
          if (channel === SERVER_STATUS_CHANNEL) {
            // The apiserver writes a single metav1.Status JSON object to channel
            // 3 once the remote command exits. Use that to know when we have
            // all the output and whether the command succeeded.
            let exitOk = true;
            try {
              const status = JSON.parse(text);
              if (status?.status && status.status !== 'Success') {
                exitOk = false;
                const detail =
                  status?.message ||
                  status?.details?.causes?.map((c: any) => c.message)?.join('; ') ||
                  '';
                if (detail) stderr += (stderr ? '\n' : '') + detail;
              }
            } catch {
              // Channel 3 occasionally returns non-JSON noise; treat as
              // best-effort completion rather than failing the whole fetch.
            }
            finish(() => resolve({ stdout, stderr, exitOk }));
          }
        };

        try {
          localExec = item.exec(container, onData, {
            command,
            tty: false,
            stdin: false,
            stdout: true,
            stderr: true,
            failCb: () => {
              if (requestId !== requestIdRef.current) return;
              finish(() => {
                if (!stdout && !stderr) {
                  reject(new Error(t('translation|Connection to the container was lost.')));
                } else {
                  resolve({ stdout, stderr, exitOk: !!stdout && !stderr });
                }
              });
            },
          });
          execRef.current = localExec;
        } catch (err: unknown) {
          finish(() => reject(err instanceof Error ? err : new Error(String(err))));
        }
      }),
    [container, item, t]
  );

  const fetchEnvironment = useCallback(async () => {
    if (!container) return;
    // Cancel any in-flight exec from a previous container / refresh so its
    // completion handlers cannot overwrite the newer request's state.
    execRef.current?.cancel();
    execRef.current = null;
    const requestId = ++requestIdRef.current;

    setLoading(true);
    setError(null);
    setRows(null);
    setRevealed({});

    try {
      const envResult = await runExec(['env'], requestId);
      if (requestId !== requestIdRef.current) return;
      if (envResult.exitOk && envResult.stdout.trim()) {
        setRows(parseEnvOutput(envResult.stdout));
        return;
      }

      // Fallback: read /proc/1/environ for distroless / minimal images that
      // ship without env or printenv on PATH.
      const procResult = await runExec(['cat', '/proc/1/environ'], requestId);
      if (requestId !== requestIdRef.current) return;
      if (procResult.stdout) {
        setRows(parseProcEnviron(procResult.stdout));
        return;
      }

      const combinedStderr = (envResult.stderr || procResult.stderr || '').trim();
      throw new Error(
        combinedStderr || t('translation|The container did not return any environment data.')
      );
    } catch (e: unknown) {
      if (requestId !== requestIdRef.current) return;
      const message =
        e instanceof Error ? e.message : t('translation|Failed to read environment variables.');
      setError(message);
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [container, enqueueSnackbar, runExec, t]);

  useEffect(() => {
    return () => {
      execRef.current?.cancel();
      execRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isContainerRunning) {
      fetchEnvironment();
    } else {
      setRows(null);
      setError(null);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, isContainerRunning]);

  const visibleRows = useMemo(() => {
    if (!rows) return null;
    if (!filter) return rows;
    const needle = filter.toLowerCase();
    return rows.filter(
      r => r.name.toLowerCase().includes(needle) || r.value.toLowerCase().includes(needle)
    );
  }, [rows, filter]);

  const copyValue = async (row: PodEnvironmentEntry) => {
    try {
      await navigator.clipboard.writeText(row.value);
      enqueueSnackbar(t('translation|Copied value of {{name}} to clipboard.', { name: row.name }), {
        variant: 'success',
      });
    } catch (err) {
      enqueueSnackbar(t('translation|Failed to copy value to clipboard.'), { variant: 'error' });
    }
  };

  const downloadEnvFile = () => {
    if (!rows || rows.length === 0) return;
    const text = rows.map(r => `${r.name}=${r.value}`).join('\n') + '\n';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${item.getName()}_${container}.env`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderBody = () => {
    if (!isContainerRunning) {
      return (
        <EmptyContent>
          {t(
            'translation|The selected container is not running. Environment variables can only be read from a running container.'
          )}
        </EmptyContent>
      );
    }
    if (loading) {
      return <Loader title={t('translation|Reading environment variables…')} />;
    }
    if (error) {
      return (
        <EmptyContent>
          <Box sx={{ textAlign: 'center' }}>
            <Typography color="error" sx={{ mb: 1, whiteSpace: 'pre-wrap' }}>
              {error}
            </Typography>
            <Button
              onClick={fetchEnvironment}
              startIcon={<Icon icon="mdi:refresh" />}
              variant="outlined"
              size="small"
            >
              {t('translation|Try again')}
            </Button>
          </Box>
        </EmptyContent>
      );
    }
    if (visibleRows && visibleRows.length === 0) {
      return (
        <EmptyContent>
          {filter
            ? t('translation|No environment variables match the current filter.')
            : t('translation|No environment variables were reported by this container.')}
        </EmptyContent>
      );
    }
    return (
      <SimpleTable
        columns={[
          {
            label: t('translation|Name'),
            gridTemplate: 'minmax(12rem, 1fr)',
            getter: (row: PodEnvironmentEntry) => (
              <Typography component="span" sx={{ fontFamily: 'monospace' }}>
                {row.name}
              </Typography>
            ),
            sort: (a: PodEnvironmentEntry, b: PodEnvironmentEntry) => a.name.localeCompare(b.name),
          },
          {
            label: t('translation|Value'),
            gridTemplate: 'minmax(16rem, 2fr)',
            getter: (row: PodEnvironmentEntry) => {
              const isRevealed = revealAll || !!revealed[row.name];
              const masked = '•'.repeat(Math.min(Math.max(row.value.length, 1), 16));
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography
                    component="span"
                    sx={{
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      flexGrow: 1,
                    }}
                  >
                    {isRevealed ? row.value : masked}
                  </Typography>
                  <Tooltip
                    title={isRevealed ? t('translation|Hide value') : t('translation|Show value')}
                  >
                    <IconButton
                      size="small"
                      aria-label={
                        isRevealed ? t('translation|Hide value') : t('translation|Show value')
                      }
                      onClick={() =>
                        setRevealed(prev => ({ ...prev, [row.name]: !prev[row.name] }))
                      }
                    >
                      <Icon icon={isRevealed ? 'mdi:eye-off' : 'mdi:eye'} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('translation|Copy value')}>
                    <IconButton
                      size="small"
                      aria-label={t('translation|Copy value')}
                      onClick={() => copyValue(row)}
                    >
                      <Icon icon="mdi:content-copy" />
                    </IconButton>
                  </Tooltip>
                </Box>
              );
            },
          },
        ]}
        data={visibleRows ?? []}
        emptyMessage={t('translation|No environment variables found.')}
        rowsPerPage={[15, 25, 50]}
        defaultSortingColumn={1}
        reflectInURL="env"
      />
    );
  };

  return (
    <SectionBox title={t('translation|Environment Variables: {{name}}', { name: item.getName() })}>
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          alignItems: 'center',
          flexWrap: 'wrap',
          mb: 2,
        }}
      >
        <FormControl sx={{ minWidth: '14rem' }} size="small">
          <InputLabel id="env-container-label">{t('glossary|Container')}</InputLabel>
          <Select
            labelId="env-container-label"
            label={t('glossary|Container')}
            value={container}
            onChange={e => setContainer(e.target.value as string)}
          >
            {containerOptions.map(c => (
              <MenuItem key={`${c.kind}-${c.name}`} value={c.name}>
                {c.name}
                {c.kind !== 'container' && (
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ ml: 1, color: 'text.secondary' }}
                  >
                    ({c.kind === 'init' ? t('translation|init') : t('translation|ephemeral')})
                  </Typography>
                )}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          size="small"
          placeholder={t('translation|Filter by name or value')}
          value={filter}
          onChange={e => setFilter(e.target.value)}
          sx={{ minWidth: '16rem' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start" sx={{ pointerEvents: 'none' }}>
                <Icon icon="mdi:magnify" aria-hidden style={{ color: 'rgba(127,127,127,0.7)' }} />
              </InputAdornment>
            ),
          }}
        />
        <FormControlLabel
          control={
            <Switch size="small" checked={revealAll} onChange={() => setRevealAll(prev => !prev)} />
          }
          label={t('translation|Reveal values')}
        />
        <Tooltip title={t('translation|Refresh')}>
          <span>
            <IconButton
              aria-label={t('translation|Refresh')}
              onClick={fetchEnvironment}
              disabled={loading || !isContainerRunning}
            >
              <Icon icon="mdi:refresh" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t('translation|Download as .env file')}>
          <span>
            <IconButton
              aria-label={t('translation|Download as .env file')}
              onClick={downloadEnvFile}
              disabled={!rows || rows.length === 0 || loading}
            >
              <Icon icon="mdi:download" />
            </IconButton>
          </span>
        </Tooltip>
        {onClose && (
          <Button onClick={onClose} variant="text">
            {t('translation|Close')}
          </Button>
        )}
      </Box>
      {renderBody()}
    </SectionBox>
  );
}

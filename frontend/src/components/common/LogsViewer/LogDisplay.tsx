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

import './LogDisplay.css';
import { Icon } from '@iconify/react';
import { alpha, Box, Button, InputAdornment, TextField, useTheme } from '@mui/material';
import { blue } from '@mui/material/colors';
import { memoize } from 'lodash';
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Trans } from 'react-i18next';
import { VariableSizeList } from 'react-window';
import { AnsiText } from './AnsiText';
import { type ParsedLog } from './ParsedLog';

function stripAnsi(str: string) {
  return str.replace(/\x1B[@-_][0-?]*[ -/]*[@-~]/g, '');
}

/** Find logs that match the query */
const useSearchLogs = (logs: ParsedLog[], query: string) => {
  const deferredQuery = useDeferredValue(query);

  const results = useMemo(() => {
    if (!deferredQuery.trim()) return [];

    const results: number[] = [];

    logs.forEach((log, index) => {
      if (log.content.toLowerCase().includes(deferredQuery.toLowerCase())) {
        results.push(index);
      }
    });

    return results;
  }, [logs, deferredQuery]);

  return results;
};

/** Proper math modulo operation */
function modulo(n: number, d: number) {
  return ((n % d) + d) % d;
}

/** Make a deterministic random color for a given string */
const getColorForString = memoize(
  (str: string, isDarkMode: boolean) => {
    let total = 0;
    for (let i = 0; i < str.length - 1; i++) {
      total += (str.charCodeAt(i) * 13371337) % 360;
    }
    const hue = total % 360;

    return isDarkMode ? `hsl(${hue} 60% 82%)` : `hsl(${hue} 70% 20%)`;
  },
  (str, isDarkmode) => str + (isDarkmode ? 'true' : 'false')
);

function Row({ index, data, style }: any) {
  const log = data.logs[index] as ParsedLog;
  const query = data.searchQuery;
  const showTimestamps = data.showTimestamps;
  const showSeverity = data.showSeverity;
  const textWrap = data.textWrap;
  const showPodName = data.showPodName;
  const theme = useTheme();

  const getSeverityColor = (severity: string) =>
    ({
      error: theme.palette.error.dark,
      warning: theme.palette.warning.dark,
      info: theme.palette.text.secondary,
      debug: blue[900],
      trace: blue[900],
      fatal: theme.palette.error.dark,
    }[severity]);

  return (
    <div
      style={{
        ...style,
        whiteSpace: textWrap ? 'pre-wrap' : 'pre',
        overflow: textWrap ? 'hidden' : undefined,
        borderColor: log.severity === 'info' ? 'transparent' : getSeverityColor(log.severity),
      }}
      className="LogsDisplay__row"
    >
      {showPodName && (
        <span style={{ color: getColorForString(log.pod!, theme.palette.mode === 'dark') }}>
          [{log.pod}]{' '}
        </span>
      )}
      {showTimestamps && (
        <span style={{ color: theme.palette.text.secondary }}>{log.timestamp} </span>
      )}
      {showSeverity && (
        <span style={{ color: getSeverityColor(log.severity) }}>{log.severity} </span>
      )}

      <code>
        <AnsiText text={log.content} searchQuery={query} />
      </code>
    </div>
  );
}

export function LogDisplay({
  logs: allLogs,
  severityFilter,
  showTimestamps,
  textWrap,
  showSeverity,
}: {
  logs: ParsedLog[];
  severityFilter?: Set<string>;
  showTimestamps?: boolean;
  textWrap?: boolean;
  showSeverity?: boolean;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [height, setHeight] = useState(0);
  const [searchResultIndex, setSearchResultIndex] = useState<number | undefined>(undefined);
  const [autoScroll, setAutoScroll] = useState(true);

  const filtered = useMemo(
    () => (severityFilter ? allLogs.filter(it => severityFilter.has(it.severity)) : allLogs),
    [severityFilter, allLogs]
  );
  const searchResults = useSearchLogs(filtered, searchQuery);

  const logs = filtered;

  const showPodName = !!logs[0]?.pod;

  const ignoreNextScrollEvent = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<VariableSizeList<unknown>>(null);
  const fontSize = 14;
  const lineHeightMultiplier = 1.4;
  const lineHeight = fontSize * lineHeightMultiplier;
  const charWidth = fontSize * 0.56;

  function getItemSize(index: number) {
    if (!boxRef.current) return lineHeight;
    if (!logs[index]) return lineHeight;
    if (!textWrap) return lineHeight;

    const data = logs[index];

    const width = boxRef.current.clientWidth;
    const charsPerLine = width / charWidth;
    const text =
      (showSeverity ? data.severity + ' ' : '') +
      (showTimestamps ? data.timestamp + ' ' : '') +
      (showPodName ? data.pod + ' ' : '') +
      stripAnsi(data.content);
    const lines = Math.ceil(text.length / charsPerLine);
    const divHeight = lines * lineHeight;

    return divHeight;
  }

  // Scroll to the selected search result
  useEffect(() => {
    if (searchResults.length > 0 && searchResultIndex === 0) {
      listRef.current?.scrollToItem(searchResults[0], 'start');
    }
  }, [searchResults]);

  // Handle resizing, make sure height of the list is right
  useEffect(() => {
    if (!boxRef.current) return;

    const observer = new ResizeObserver(entries => {
      setHeight(entries[0].contentRect.height);
      if (!listRef.current) return;
      listRef.current.resetAfterIndex(0, true);
    });

    observer.observe(boxRef.current);

    return () => observer.disconnect();
  }, [height]);

  // Recalculate row heights when row content changes
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.resetAfterIndex(0, true);
  }, [textWrap, showSeverity, showTimestamps, severityFilter]);

  // Scroll to bottom by default, unless user has scrolled
  useLayoutEffect(() => {
    if (!listRef.current || !autoScroll) return;

    ignoreNextScrollEvent.current = true;
    listRef.current.scrollToItem(logs.length - 1);
  }, [logs, height, autoScroll]);

  const handleChangeResultIndex = (diff: 1 | -1) => {
    const newIndex =
      searchResultIndex === undefined ? 0 : modulo(searchResultIndex + diff, searchResults.length);
    setSearchResultIndex(newIndex);
    listRef.current?.scrollToItem(searchResults[newIndex], 'start');
  };

  return (
    <Box
      ref={boxRef}
      sx={{
        position: 'relative',
        flexGrow: 1,
        width: '100%',
        fontFamily: 'monospace',
        overflow: 'hidden',
        fontSize: fontSize + 'px',
        lineHeight: lineHeight + 'px',
      }}
      onScrollCapture={() => {
        if (ignoreNextScrollEvent.current) {
          ignoreNextScrollEvent.current = false;
          return;
        }

        setAutoScroll(false);
      }}
    >
      <Box
        sx={theme => ({
          position: 'absolute',
          top: 0,
          right: 0,
          mr: 4,
          mt: 2,
          p: 0,
          zIndex: 1,
          boxShadow: '2px 2px 8px rgba(0,0,0,0.1)',
          borderRadius: theme.shape.borderRadius + 'px',
        })}
      >
        {!showSearch ? (
          <Button
            variant="contained"
            color="secondary"
            onClick={() => setShowSearch(true)}
            sx={{ fontSize: '1.25rem', minWidth: '42px', minHeight: '42px', p: 0 }}
          >
            <Icon icon="mdi:search" />
          </Button>
        ) : (
          <Box
            sx={theme => ({
              background: alpha(theme.palette.background.muted, 0.95),
              border: '1px solid',
              borderColor: theme.palette.divider,
              p: 1,
              borderRadius: theme.shape.borderRadius + 'px',
              display: 'flex',
              alignItems: 'stretch',
            })}
          >
            <form
              onSubmit={e => {
                e.preventDefault();
                e.stopPropagation();

                handleChangeResultIndex(+1);
              }}
            >
              <TextField
                variant="outlined"
                size="small"
                label={<Trans>Search</Trans>}
                value={searchQuery}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      {searchResults.length > 0 && (
                        <>
                          {(searchResultIndex ?? 0) + 1}/{searchResults.length}
                        </>
                      )}
                    </InputAdornment>
                  ),
                }}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setSearchResultIndex(0);
                }}
              />
            </form>
            <Button
              onClick={() => handleChangeResultIndex(-1)}
              size="small"
              sx={{ minWidth: '3em' }}
            >
              <Icon icon="mdi:chevron-up" />
            </Button>
            <Button
              onClick={() => handleChangeResultIndex(+1)}
              size="small"
              sx={{ minWidth: '3em' }}
            >
              <Icon icon="mdi:chevron-down" />
            </Button>
            <Button
              onClick={() => {
                setSearchQuery('');
                setShowSearch(false);
              }}
              size="small"
              sx={{ minWidth: '3em' }}
            >
              <Icon icon="mdi:close" />
            </Button>
          </Box>
        )}
      </Box>
      <Button
        variant="contained"
        color="secondary"
        sx={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          mr: 4,
          mb: 2,
          zIndex: 10,
          display: autoScroll ? 'none' : 'flex',
          boxShadow: '2px 2px 8px rgba(0,0,0,0.1)',
        }}
        onClick={() => {
          if (!listRef.current) return;
          ignoreNextScrollEvent.current = true;
          listRef.current.scrollToItem(logs.length - 1);
          setAutoScroll(true);
        }}
        startIcon={<Icon icon="mdi:arrow-down" />}
      >
        <Trans>Scroll to bottom</Trans>
      </Button>
      {height > 0 && (
        <VariableSizeList
          ref={listRef}
          height={height}
          itemCount={logs.length}
          itemSize={getItemSize}
          itemData={{ logs, searchQuery, showTimestamps, showSeverity, textWrap, showPodName }}
          width="100%"
          children={Row}
        />
      )}
    </Box>
  );
}

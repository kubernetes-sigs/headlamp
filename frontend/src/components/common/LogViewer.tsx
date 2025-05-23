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

import { Box, Button, DialogContent, Grid, InputBase, Paper, useTheme } from '@mui/material';
import { FitAddon } from '@xterm/addon-fit';
import { ISearchOptions, SearchAddon } from '@xterm/addon-search';
import { Terminal as XTerminal } from '@xterm/xterm';
import _ from 'lodash';
import React, { ReactNode, useEffect } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';
import ActionButton from './ActionButton';
import { Dialog, DialogProps } from './Dialog';

export interface LogViewerProps extends DialogProps {
  logs: string[]; // Primarily for download; actual display managed by parent via xtermRef
  title?: string;
  downloadName?: string;
  onClose: () => void;
  topActions?: ReactNode[];
  open: boolean;
  xtermRef: React.MutableRefObject<XTerminal | null>; // Changed: xtermRef is now mandatory and controlled by parent
  handleReconnect?: () => void;
  showReconnectButton?: boolean;
}

export function LogViewer(props: LogViewerProps) {
  const {
    logs,
    title = '',
    downloadName = 'log',
    xtermRef: parentXtermRef, // This ref object is from the parent (PodLogViewer)
    onClose,
    topActions = [],
    handleReconnect,
    showReconnectButton = false,
    open: dialogOpen, // Renamed to avoid conflict with xterm.open
    ...otherDialogProps
  } = props;
  const { t } = useTranslation();
  const theme = useTheme(); // For theming SearchPopover

  // This component uses the xtermRef passed from the parent. It initializes xterm into it.
  const fitAddonRef = React.useRef<FitAddon | null>(null);
  const searchAddonRef = React.useRef<SearchAddon | null>(null);
  const [terminalContainerRef, setTerminalContainerRef] = React.useState<HTMLElement | null>(null);
  const [showSearch, setShowSearch] = React.useState(false);

  useHotkeys('ctrl+shift+f', () => {
    setShowSearch(show => !show); // Toggle search visibility
  });

  function downloadLog() {
    const time = new Date().toISOString().replace(/:/g, '-').slice(0, -5);
    const element = document.createElement('a');
    const fileContent = logs.map(line => line + (line.endsWith('\n') ? '' : '\n')).join('');
    const file = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `${downloadName}_${time}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }

  React.useEffect(() => {
    // console.log('LogViewer: useEffect for terminal init. terminalContainerRef:', !!terminalContainerRef, 'parentXtermRef.current:', !!parentXtermRef.current);
    if (!terminalContainerRef || parentXtermRef.current) {
      // Terminal already initialized by this effect or container not ready
      return;
    }

    // console.log('LogViewer: Initializing new XTerminal instance.');
    fitAddonRef.current = new FitAddon();
    searchAddonRef.current = new SearchAddon();

    const xterm = new XTerminal({
      cursorStyle: 'bar',
      scrollback: 10000,
      rows: 30,
      lineHeight: 1.21,
      allowProposedApi: true,
      convertEol: true,
      theme: {
        // Basic theme, consider making this configurable
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: '#264f78',
      },
    });

    // Populate the parent's ref object with this new XTerminal instance.
    // This allows the parent (PodLogViewer) to control this XTerminal instance.
    parentXtermRef.current = xterm;

    xterm.loadAddon(fitAddonRef.current);
    xterm.loadAddon(searchAddonRef.current);
    enableCopyPasteInXterm(xterm);

    xterm.open(terminalContainerRef);
    // console.log('LogViewer: XTerminal opened in container.');

    try {
      fitAddonRef.current.fit();
      // console.log('LogViewer: FitAddon executed.');
    } catch (e) {
      // console.error('LogViewer: Error calling fitAddon.fit():', e);
    }

    // Parent (PodLogViewer) is now responsible for writing initial logs and subsequent updates.

    const pageResizeHandler = _.debounce(() => {
      // console.log('LogViewer: Window resize detected, calling fitAddon.fit()');
      fitAddonRef.current?.fit();
    }, 250);
    window.addEventListener('resize', pageResizeHandler);

    return function cleanup() {
      // console.log('LogViewer: Cleanup. Disposing xterm instance and addons.');
      window.removeEventListener('resize', pageResizeHandler);
      searchAddonRef.current?.dispose();
      searchAddonRef.current = null;
      fitAddonRef.current?.dispose();
      fitAddonRef.current = null;

      // Critical: Dispose the terminal instance
      if (parentXtermRef.current) {
        parentXtermRef.current.dispose();
        parentXtermRef.current = null; // Clear the ref in the parent
      }
    };
  }, [terminalContainerRef, parentXtermRef]); // Effect for initializing terminal

  // Effect to fit terminal when dialog's full-screen state changes or it opens
  React.useEffect(() => {
    if (dialogOpen && fitAddonRef.current && parentXtermRef.current?.element) {
      // console.log('LogViewer: Dialog open/fullscreen changed, attempting to fit.');
      // Timeout to allow layout to settle after dialog changes
      const fitTimeout = setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          // console.log('LogViewer: FitAddon executed on dialog open/fullscreen.');
        } catch (e) {
          // console.error('LogViewer: Error fitting on dialog open/fullscreen:', e);
        }
      }, 150);
      return () => clearTimeout(fitTimeout);
    }
  }, [dialogOpen, otherDialogProps.fullScreen, parentXtermRef]);

  return (
    <Dialog
      title={title}
      onFullScreenToggled={() => {
        // The effect above handles fitting on fullScreen prop change
      }}
      withFullScreen
      onClose={onClose}
      open={dialogOpen}
      {...otherDialogProps}
    >
      <DialogContent
        sx={{
          height: '80vh', // Use vh for more predictable sizing relative to viewport
          minHeight: '300px', // Ensure a minimum height
          display: 'flex',
          flexDirection: 'column',
          padding: theme.spacing(1, 2, 2, 2),
          overflow: 'hidden', // Prevent double scrollbars from DialogContent itself
          '& .xterm ': {
            height: '100%',
            '& .xterm-viewport': {
              width: 'initial !important', // BugFix for xterm.js
            },
          },
          '& #xterm-container-wrapper': {
            // Wrapper for positioning and potential scrollbars if xterm fails
            flex: '1 1 auto',
            overflow: 'hidden', // This should ideally contain xterm's own scrollbars
            position: 'relative', // For reconnect button and search popover
            display: 'flex', // To make #xterm-container fill it
            flexDirection: 'column',
          },
          '& #xterm-container': {
            // Direct container for xterm.js instance
            flex: '1 1 auto',
            width: '100%',
            height: '100%', // Take full height of the wrapper
            '& .terminal.xterm': {
              padding: theme.spacing(0.5), // Reduced padding for more log space
              height: '100%',
            },
          },
        }}
      >
        <Grid
          container
          justifyContent="space-between"
          alignItems="center"
          wrap="nowrap"
          sx={{ pb: 1, flexShrink: 0 }}
        >
          <Grid
            item
            container
            spacing={1}
            alignItems="center"
            wrap="nowrap"
            sx={{ overflowX: 'auto' }}
          >
            {topActions.map((component, i) => (
              <Grid item key={i}>
                {component}
              </Grid>
            ))}
          </Grid>
          <Grid item container xs justifyContent="flex-end" spacing={1} wrap="nowrap">
            <Grid item>
              <ActionButton
                description={t('translation|Find')}
                onClick={() => setShowSearch(show => !show)}
                icon="mdi:magnify"
              />
            </Grid>
            <Grid item>
              <ActionButton
                description={t('translation|Clear')}
                onClick={() => parentXtermRef.current?.clear()}
                icon="mdi:broom"
              />
            </Grid>
            <Grid item>
              <ActionButton
                description={t('Download')}
                onClick={downloadLog}
                icon="mdi:file-download-outline"
                iconButtonProps={{ disabled: logs.length === 0 }} // <<< CORRECTED LINE
              />
            </Grid>
          </Grid>
        </Grid>
        {/* This Box is the main container for the terminal and reconnect button */}
        <Box id="xterm-container-wrapper">
          {showReconnectButton && handleReconnect && (
            <Button
              onClick={handleReconnect}
              color="info"
              variant="contained"
              sx={{
                position: 'absolute',
                top: theme.spacing(1),
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 10,
              }}
            >
              {t('translation|Reconnect')}
            </Button>
          )}
          <div
            id="xterm-container"
            ref={setTerminalContainerRef} // Callback ref to get the DOM element for xterm.open()
          />
          <SearchPopover
            open={showSearch}
            onClose={() => setShowSearch(false)}
            searchAddonRef={searchAddonRef}
            xtermRef={parentXtermRef}
          />
        </Box>
      </DialogContent>
    </Dialog>
  );
}

function enableCopyPasteInXterm(xterm: XTerminal) {
  xterm.attachCustomKeyEventHandler(arg => {
    if (arg.ctrlKey && arg.code === 'KeyC' && arg.type === 'keydown') {
      const selection = xterm.getSelection();
      if (selection) {
        navigator.clipboard
          .writeText(selection)
          .catch(err => console.error('Failed to copy text: ', err));
        return false; // Prevent default handling if we successfully copied
      }
    }
    // For Ctrl+V, xterm.js handles paste internally by default if not overridden
    // or if the application doesn't capture the event.
    // Let xterm.js handle it or use xterm.paste("text") if intercepting.
    return true; // Allow other keys to be processed by xterm
  });
}

interface SearchPopoverProps {
  searchAddonRef: React.MutableRefObject<SearchAddon | null>;
  xtermRef: React.MutableRefObject<XTerminal | null>; // Pass xtermRef for focusing
  open: boolean;
  onClose: () => void;
}

export function SearchPopover(props: SearchPopoverProps) {
  const { searchAddonRef, xtermRef, open, onClose } = props;
  const theme = useTheme();
  const [searchResult, setSearchResult] = React.useState<
    { resultIndex: number; resultCount: number } | undefined
  >(undefined);
  const [searchText, setSearchText] = React.useState<string>('');
  const [caseSensitiveChecked, setCaseSensitiveChecked] = React.useState<boolean>(false);
  const [wholeWordMatchChecked, setWholeWordMatchChecked] = React.useState<boolean>(false);
  const [regexChecked, setRegexChecked] = React.useState<boolean>(false);
  const { t } = useTranslation(['translation']);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    } else if (!open) {
      // When closing, return focus to the terminal if it exists
      xtermRef.current?.focus();
    }
  }, [open, xtermRef]);

  const randomId = React.useMemo(() => _.uniqueId('search-input-'), []);

  const searchAddonTextDecorationOptions: ISearchOptions['decorations'] = {
    matchBackground: theme.palette.mode === 'dark' ? '#6d402a' : '#ffe6cc',
    activeMatchBackground: theme.palette.mode === 'dark' ? '#515c6a' : '#cce5ff',
    matchOverviewRuler: theme.palette.error.main,
    activeMatchColorOverviewRuler: theme.palette.action.active,
  };

  const performSearch = React.useCallback(
    (direction: 'next' | 'previous' | 'new' = 'new') => {
      if (!searchAddonRef.current || !searchText) {
        searchAddonRef.current?.clearDecorations();
        setSearchResult(undefined);
        return;
      }
      try {
        const options: ISearchOptions = {
          regex: regexChecked,
          caseSensitive: caseSensitiveChecked,
          wholeWord: wholeWordMatchChecked,
          decorations: searchAddonTextDecorationOptions,
        };
        if (direction === 'next' || direction === 'new') {
          searchAddonRef.current.findNext(searchText, options);
        } else {
          searchAddonRef.current.findPrevious(searchText, options);
        }
      } catch (e) {
        // console.warn('Error searching logs: ', e);
        searchAddonRef.current?.clearDecorations();
        setSearchResult(undefined);
      }
    },
    [
      searchText,
      regexChecked,
      caseSensitiveChecked,
      wholeWordMatchChecked,
      searchAddonRef,
      searchAddonTextDecorationOptions,
    ]
  );

  useEffect(() => {
    if (!searchAddonRef.current) return;

    if (!open) {
      searchAddonRef.current.clearDecorations();
      setSearchResult(undefined);
      return;
    }
    // Perform search when text or options change, or when it opens
    performSearch('new');

    const disposable = searchAddonRef.current.onDidChangeResults(results => {
      setSearchResult(
        results ? { resultIndex: results.resultIndex, resultCount: results.resultCount } : undefined
      );
    });

    return () => {
      disposable?.dispose();
    };
  }, [
    open,
    searchText,
    caseSensitiveChecked,
    wholeWordMatchChecked,
    regexChecked,
    searchAddonRef,
    performSearch,
  ]);

  const handleFindNext = () => performSearch('next');
  const handleFindPrevious = () => performSearch('previous');

  const handleClose = () => {
    onClose();
  };

  const onSearchTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(event.target.value);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        handleFindPrevious();
      } else {
        handleFindNext();
      }
    } else if (event.key === 'Escape') {
      handleClose();
    }
  };

  const searchResultsText = () => {
    if (!searchText) return t('translation|Enter search term');
    if (!searchResult || searchResult.resultCount === 0) return t('translation|No results');
    return t('translation|{{ currentIndex }} of {{ totalResults }}', {
      currentIndex: searchResult.resultIndex + 1,
      totalResults: searchResult.resultCount,
    });
  };

  return !open ? null : (
    <Paper
      elevation={3}
      sx={{
        position: 'absolute',
        background: theme.palette.background.paper,
        top: theme.spacing(1),
        right: theme.spacing(2),
        padding: theme.spacing(0.5, 1),
        zIndex: theme.zIndex.modal + 1, // Ensure it's above other modal content
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        border: `1px solid ${theme.palette.divider}`,
        '& .SearchTextArea': {
          background: theme.palette.action.hover,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          padding: theme.spacing(0.25, 0.5, 0.25, 0),
          width: 240,
          '& .MuiInputBase-root': {
            color: theme.palette.text.primary,
            fontSize: '0.85rem',
            border: '1px solid transparent',
            '&.Mui-focused': {
              borderColor: theme.palette.primary.main,
            },
            '& > input': {
              padding: theme.spacing(0.5, 1),
            },
          },
          '& .MuiIconButton-root': {
            margin: theme.spacing(0, 0.125),
            padding: theme.spacing(0.5),
            fontSize: '1.05rem',
            color: theme.palette.text.secondary,
            borderRadius: '4px',
            '&.checked': {
              background: theme.palette.action.selected,
              color: theme.palette.primary.contrastText,
            },
          },
        },
        '& .search-results': {
          width: 'auto',
          minWidth: 90,
          marginLeft: theme.spacing(1),
          fontSize: '0.8rem',
          textAlign: 'center',
          color:
            (!searchText || !searchResult || searchResult.resultCount === 0) && searchText
              ? theme.palette.error.main
              : theme.palette.text.secondary,
        },
        '& .search-actions': {
          '& .MuiIconButton-root': {
            padding: theme.spacing(0.25),
            fontSize: '1.05rem',
            color: theme.palette.text.secondary,
            '&.Mui-disabled': {
              color: theme.palette.action.disabled,
            },
          },
        },
      }}
    >
      <Box className="SearchTextArea">
        <InputBase
          value={searchText}
          onChange={onSearchTextChange}
          placeholder={t('translation|Find')}
          inputProps={{ autoComplete: 'off', type: 'text', name: randomId, id: randomId }}
          onKeyDown={handleInputKeyDown}
          inputRef={inputRef}
        />
        <ActionButton
          icon="mdi:format-letter-case"
          onClick={() => setCaseSensitiveChecked(c => !c)}
          description={t('translation|Match case')}
          iconButtonProps={{ className: caseSensitiveChecked ? 'checked' : '' }}
        />
        <ActionButton
          icon="mdi:format-letter-matches"
          onClick={() => setWholeWordMatchChecked(w => !w)}
          description={t('translation|Match whole word')}
          iconButtonProps={{ className: wholeWordMatchChecked ? 'checked' : '' }}
        />
        <ActionButton
          icon="mdi:regex"
          onClick={() => setRegexChecked(r => !r)}
          description={t('translation|Use regular expression')}
          iconButtonProps={{ className: regexChecked ? 'checked' : '' }}
        />
      </Box>
      <div className="search-results">{searchResultsText()}</div>
      <div className="search-actions">
        <ActionButton
          icon="mdi:arrow-up"
          onClick={handleFindPrevious}
          description={t('translation|Previous Match (Shift+Enter)')}
          iconButtonProps={{ disabled: !searchResult || searchResult.resultCount === 0 }}
        />
        <ActionButton
          icon="mdi:arrow-down"
          onClick={handleFindNext}
          description={t('translation|Next Match (Enter)')}
          iconButtonProps={{ disabled: !searchResult || searchResult.resultCount === 0 }}
        />
        <ActionButton
          icon="mdi:close"
          onClick={handleClose}
          description={t('translation|Close (Esc)')}
        />
      </div>
    </Paper>
  );
}

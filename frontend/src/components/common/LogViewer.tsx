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

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import DialogContent from '@mui/material/DialogContent';
import Grid from '@mui/material/Grid';
import InputBase from '@mui/material/InputBase';
import Paper from '@mui/material/Paper';
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
  logs: string[];
  title?: string;
  downloadName?: string;
  onClose: () => void;
  topActions?: ReactNode[];
  open: boolean;
  xtermRef?: React.MutableRefObject<XTerminal | null>;
  /**
   * @description This is a callback function that is called when the user clicks on the reconnect button.
   * @returns void
   */
  handleReconnect?: () => void;
  /**
   * @description This is a boolean that determines whether the reconnect button should be shown or not.
   */
  showReconnectButton?: boolean;
  /** Don't render in the dialog */
  noDialog?: boolean;
}

export function LogViewer(props: LogViewerProps) {
  const {
    logs,
    title = '',
    downloadName = 'log',
    xtermRef: outXtermRef,
    onClose,
    topActions = [],
    handleReconnect,
    showReconnectButton = false,
    ...other
  } = props;
  const { t } = useTranslation();
  const xtermRef = React.useRef<XTerminal | null>(null);
  const fitAddonRef = React.useRef<any>(null);
  const searchAddonRef = React.useRef<any>(null);
  const [terminalContainerRef, setTerminalContainerRef] = React.useState<HTMLElement | null>(null);
  const [showSearch, setShowSearch] = React.useState(false);

  useHotkeys('ctrl+shift+f', () => {
    setShowSearch(true);
  });

  function downloadLog() {
    // Cuts off the last 5 digits of the timestamp to remove the milliseconds
    const time = new Date().toISOString().replace(/:/g, '-').slice(0, -5);

    const element = document.createElement('a');
    const file = new Blob(logs, { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${downloadName}_${time}.txt`;
    // Required for FireFox
    document.body.appendChild(element);
    element.click();
  }

  React.useEffect(() => {
    if (!terminalContainerRef || !!xtermRef.current) {
      return;
    }

    fitAddonRef.current = new FitAddon();
    searchAddonRef.current = new SearchAddon();

    xtermRef.current = new XTerminal({
      cursorStyle: 'bar',
      scrollback: 10000,
      rows: 30, // initial rows before fit
      lineHeight: 1.21,
      allowProposedApi: true,
    });

    if (!!outXtermRef) {
      outXtermRef.current = xtermRef.current;
    }

    xtermRef.current.loadAddon(fitAddonRef.current);
    xtermRef.current.loadAddon(searchAddonRef.current);
    enableCopyPasteInXterm(xtermRef.current);

    xtermRef.current.open(terminalContainerRef!);

    fitAddonRef.current!.fit();

    xtermRef.current?.write(getJointLogs());

    const pageResizeHandler = () => {
      fitAddonRef.current!.fit();
      console.debug('resize');
    };
    window.addEventListener('resize', pageResizeHandler);

    return function cleanup() {
      window.removeEventListener('resize', pageResizeHandler);
      xtermRef.current?.dispose();
      searchAddonRef.current?.dispose();
      xtermRef.current = null;
    };
  }, [terminalContainerRef, xtermRef.current]);

  React.useEffect(() => {
    if (!xtermRef.current) {
      return;
    }

    // We're delegating to external xterm ref.
    if (!!outXtermRef) {
      return;
    }

    xtermRef.current?.clear();
    xtermRef.current?.write(getJointLogs());

    return function cleanup() {};
  }, [logs, xtermRef]);

  function getJointLogs() {
    return logs?.join('').replaceAll('\n', '\r\n');
  }

  const content = (
    <DialogContent
      sx={theme => ({
        height: '80%',
        minHeight: '80%',
        display: 'flex',
        flexDirection: 'column',
        '& .xterm ': {
          height: '100vh', // So the terminal doesn't stay shrunk when shrinking vertically and maximizing again.
          '& .xterm-viewport': {
            width: 'initial !important', // BugFix: https://github.com/xtermjs/xterm.js/issues/3564#issuecomment-1004417440
          },
        },
        '& #xterm-container': {
          overflow: 'hidden',
          width: '100%',
          height: '100%',
          '& .terminal.xterm': {
            padding: theme.spacing(1),
          },
        },
      })}
    >
      <Grid container justifyContent="space-between" alignItems="center" wrap="nowrap">
        <Grid item container spacing={1}>
          {topActions.map((component, i) => (
            <Grid item key={i}>
              {component}
            </Grid>
          ))}
        </Grid>
        <Grid item xs>
          <ActionButton
            description={t('translation|Find')}
            onClick={() => setShowSearch(show => !show)}
            icon="mdi:magnify"
          />
        </Grid>
        <Grid item xs>
          <ActionButton
            description={t('translation|Clear')}
            onClick={() => clearPodLogs(xtermRef)}
            icon="mdi:broom"
          />
        </Grid>
        <Grid item xs>
          <ActionButton
            description={t('Download')}
            onClick={downloadLog}
            icon="mdi:file-download-outline"
          />
        </Grid>
      </Grid>
      <Box
        sx={theme => ({
          paddingTop: theme.spacing(1),
          flex: 1,
          width: '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column-reverse',
          position: 'relative',
        })}
      >
        {showReconnectButton && (
          <Button onClick={handleReconnect} color="info" variant="contained">
            Reconnect
          </Button>
        )}
        <div
          id="xterm-container"
          ref={ref => setTerminalContainerRef(ref)}
          style={{ flex: 1, display: 'flex', flexDirection: 'column-reverse' }}
        />
        <SearchPopover
          open={showSearch}
          onClose={() => setShowSearch(false)}
          searchAddonRef={searchAddonRef}
        />
      </Box>
    </DialogContent>
  );

  if (props.noDialog) {
    return content;
  }

  return (
    <Dialog
      title={title}
      onFullScreenToggled={() => {
        setTimeout(() => {
          fitAddonRef.current!.fit();
        }, 1);
      }}
      withFullScreen
      onClose={onClose}
      {...other}
    >
      {content}
    </Dialog>
  );
}

// clears logs for pod
function clearPodLogs(xtermRef: React.MutableRefObject<XTerminal | null>) {
  xtermRef.current?.clear();
  // keeping this comment if logs dont print after clear
  // xtermRef.current?.write(getJointLogs());
}

function enableCopyPasteInXterm(xterm: XTerminal) {
  xterm.attachCustomKeyEventHandler(arg => {
    if (arg.ctrlKey && arg.code === 'KeyC' && arg.type === 'keydown') {
      const selection = xterm.getSelection();
      if (selection) {
        return false;
      }
    }
    if (arg.ctrlKey && arg.code === 'KeyV' && arg.type === 'keydown') {
      return false;
    }
    return true;
  });
}

interface SearchPopoverProps {
  searchAddonRef: { current: SearchAddon | null };
  open: boolean;
  onClose: () => void;
}

export function SearchPopover(props: SearchPopoverProps) {
  const { searchAddonRef, open, onClose } = props;
  const [searchResult, setSearchResult] = React.useState<
    { resultIndex: number; resultCount: number } | undefined
  >(undefined);
  const [searchText, setSearchText] = React.useState<string>('');
  const [caseSensitiveChecked, setCaseSensitiveChecked] = React.useState<boolean>(false);
  const [wholeWordMatchChecked, setWholeWordMatchChecked] = React.useState<boolean>(false);
  const [regexChecked, setRegexChecked] = React.useState<boolean>(false);
  const { t } = useTranslation(['translation']);
  const focusedRef = React.useCallback(
    (node: HTMLInputElement) => {
      if (open && !!node) {
        node.focus();
        node.select();
      }
    },
    [open]
  );

  const randomId = _.uniqueId('search-input-');

  const searchAddonTextDecorationOptions: ISearchOptions['decorations'] = {
    matchBackground: '#6d402a',
    activeMatchBackground: '#515c6a',
    matchOverviewRuler: '#f00',
    activeMatchColorOverviewRuler: '#515c6a',
  };

  useEffect(() => {
    if (!open) {
      searchAddonRef.current?.clearDecorations();
      searchAddonRef.current?.clearActiveDecoration();
      return;
    }

    try {
      searchAddonRef.current?.findNext(searchText, {
        regex: regexChecked,
        caseSensitive: caseSensitiveChecked,
        wholeWord: wholeWordMatchChecked,
        decorations: searchAddonTextDecorationOptions,
      });
    } catch (e) {
      // Catch invalid regular expression error
      console.log('Error searching logs: ', e);
      searchAddonRef.current?.findNext('');
    }

    searchAddonRef.current?.onDidChangeResults(args => {
      setSearchResult(args);
    });

    return function cleanup() {
      searchAddonRef.current?.findNext('');
    };
  }, [searchText, caseSensitiveChecked, wholeWordMatchChecked, regexChecked, open]);

  const handleFindNext = () => {
    searchAddonRef.current?.findNext(searchText, {
      regex: regexChecked,
      caseSensitive: caseSensitiveChecked,
      wholeWord: wholeWordMatchChecked,
      decorations: searchAddonTextDecorationOptions,
    });
  };

  const handleFindPrevious = () => {
    searchAddonRef.current?.findPrevious(searchText, {
      regex: regexChecked,
      caseSensitive: caseSensitiveChecked,
      wholeWord: wholeWordMatchChecked,
      decorations: searchAddonTextDecorationOptions,
    });
  };

  const handleClose = () => {
    onClose();
  };

  const onSearchTextChange = (event: any) => {
    setSearchText(event.target.value);
  };

  const handleInputKeyDown = (event: any) => {
    if (event.key === 'Enter') {
      if (event.shiftKey) {
        handleFindPrevious();
      } else {
        handleFindNext();
      }
    }
  };

  const baseGray = '#cccccc';
  const grayText = {
    color: baseGray,
  };
  const redText = {
    color: '#f48771',
  };

  const searchResults = () => {
    let color = grayText;
    let msg = '';
    if (!searchText) {
      msg = t('translation|No results');
    } else if (!searchResult) {
      msg = t('translation|Too many matches');
      color = redText;
    } else {
      if (searchResult.resultCount === 0) {
        msg = t('translation|No results');
        color = redText;
      } else {
        msg = t('translation|{{ currentIndex }} of {{ totalResults }}', {
          currentIndex:
            searchResult?.resultIndex !== undefined ? searchResult?.resultIndex + 1 : '?',
          totalResults:
            searchResult?.resultCount === undefined ? '999+' : searchResult?.resultCount,
        });
      }
    }

    return (
      <Box component="span" sx={color}>
        {msg}
      </Box>
    );
  };

  return !open ? (
    <></>
  ) : (
    <Paper
      sx={theme => {
        //@todo: This style should match the theme being used.
        return {
          position: 'absolute',
          background: '#252526',
          top: 8,
          right: 15,
          padding: '4px 8px',
          zIndex: theme.zIndex.modal,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          borderLeft: `2px solid #555`,
          '& .SearchTextArea': {
            background: '#3c3c3c',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            padding: '1px 4px 2px 0',
            width: 240,
            '& .MuiInputBase-root': {
              color: baseGray,
              fontSize: '0.85rem',
              border: '1px solid rgba(0,0,0,0)',
              '&.Mui-focused': {
                border: `1px solid #007fd4`,
              },
              '&>input': {
                padding: '2px 4px',
              },
            },
            '& .MuiIconButton-root': {
              margin: '0 1px',
              padding: theme.spacing(0.5),
              fontSize: '1.05rem',
              color: baseGray,
              borderRadius: 4,
              '&.checked': {
                background: '#245779',
              },
            },
          },
          '& .search-results': {
            width: 70,
            marginLeft: 8,
            fontSize: '0.8rem',
          },
          '& .search-actions': {
            '& .MuiIconButton-root': {
              padding: 2,
              fontSize: '1.05rem',
              color: baseGray,
              '&.Mui-disabled': {
                color: '#767677',
              },
            },
          },
        };
      }}
    >
      <Box className="SearchTextArea">
        <InputBase
          value={searchText}
          onChange={onSearchTextChange}
          placeholder={t('translation|Find')}
          inputProps={{ autoComplete: 'off', type: 'text', name: randomId, id: randomId }}
          onKeyDown={handleInputKeyDown}
          inputRef={focusedRef}
        />
        <ActionButton
          icon="mdi:format-letter-case"
          onClick={() => setCaseSensitiveChecked(!caseSensitiveChecked)}
          description={t('translation|Match case')}
          iconButtonProps={{
            className: caseSensitiveChecked ? 'checked' : '',
          }}
        />
        <ActionButton
          icon="mdi:format-letter-matches"
          onClick={() => setWholeWordMatchChecked(!wholeWordMatchChecked)}
          description={t('translation|Match whole word')}
          iconButtonProps={{
            className: wholeWordMatchChecked ? 'checked' : '',
          }}
        />
        <ActionButton
          icon="mdi:regex"
          onClick={() => setRegexChecked(!regexChecked)}
          description={t('translation|Use regular expression')}
          iconButtonProps={{
            className: regexChecked ? 'checked' : '',
          }}
        />
      </Box>
      <div className="search-results">{searchResults()}</div>
      <div className="search-actions">
        <ActionButton
          icon="mdi:arrow-up"
          onClick={handleFindPrevious}
          description={t('translation|Previous Match (Shift+Enter)')}
          iconButtonProps={{
            disabled: !searchResult?.resultCount && searchResult?.resultCount !== undefined,
          }}
        />
        <ActionButton
          icon="mdi:arrow-down"
          onClick={handleFindNext}
          description={t('translation|Next Match (Enter)')}
          iconButtonProps={{
            disabled: !searchResult?.resultCount && searchResult?.resultCount !== undefined,
          }}
        />
        <ActionButton icon="mdi:close" onClick={handleClose} description={t('translation|Close')} />
      </div>
    </Paper>
  );
}

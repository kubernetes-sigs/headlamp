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
import {
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  Popover,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import { setNamespaceFilter } from '../../redux/filterSlice';
import { useTypedSelector } from '../../redux/hooks';
import { LightTooltip } from '../common/Tooltip';
import {
  addSavedAdvancedSearch,
  deleteSavedAdvancedSearch,
  readSavedAdvancedSearches,
  renameSavedAdvancedSearch,
  SavedAdvancedSearch,
  writeSavedAdvancedSearches,
} from './savedAdvancedSearches';

export function SavedSearches({
  rawQuery,
  resourcesValue,
  onSearchSelected,
}: {
  rawQuery: string;
  resourcesValue: string | 'all';
  onSearchSelected: (search: SavedAdvancedSearch) => void;
}) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const history = useHistory();
  const location = useLocation();
  const selectedNamespaces = useTypedSelector(state => state.filter.namespaces);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [searches, setSearches] = useState(() => readSavedAdvancedSearches());
  const searchesRef = useRef(searches);
  const [saveName, setSaveName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState('');

  const queryCanBeSaved = rawQuery.trim().length > 0;

  const closePopover = () => {
    setEditId(null);
    setEditName('');
    setSaveName('');
    setError('');
    setAnchorEl(null);
  };

  const updateSearches = (updater: (current: SavedAdvancedSearch[]) => SavedAdvancedSearch[]) => {
    const current = searchesRef.current;
    const next = updater(current);
    if (next === current) {
      return;
    }

    try {
      writeSavedAdvancedSearches(next);
      searchesRef.current = next;
      setSearches(next);
      setError('');
    } catch {
      setError(t('Could not save searches in local storage.'));
    }
  };

  const updateNamespaceQuery = (nextNamespaces: string[]) => {
    const searchParams = new URLSearchParams(location.search);
    if (nextNamespaces.length > 0) {
      searchParams.set('namespace', nextNamespaces.join(' '));
    } else {
      searchParams.delete('namespace');
    }

    history.push({
      pathname: location.pathname,
      search: searchParams.toString(),
    });
  };

  const restoreSearch = (search: SavedAdvancedSearch) => {
    onSearchSelected(search);
    dispatch(setNamespaceFilter(search.namespaces));
    updateNamespaceQuery(search.namespaces);
    closePopover();
  };

  return (
    <>
      <Badge
        badgeContent={searches.length}
        color="primary"
        anchorOrigin={{
          horizontal: 'right',
          vertical: 'top',
        }}
        slotProps={{
          badge: {
            style: {
              top: '4px',
              right: '4px',
            },
          },
        }}
      >
        <Button
          variant="contained"
          color="secondary"
          startIcon={<Icon icon="mdi:format-list-checks" />}
          onClick={e => setAnchorEl(e.currentTarget)}
        >
          <Trans>Saved Searches</Trans>
        </Button>
      </Badge>

      <Popover
        elevation={4}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        onClose={closePopover}
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
      >
        <Box sx={{ padding: 2, width: '420px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="subtitle2">
              <Trans>Save current search</Trans>
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                label={t('Name')}
                variant="outlined"
                size="small"
                value={saveName}
                disabled={!queryCanBeSaved}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && saveName.trim() && queryCanBeSaved) {
                    updateSearches(current =>
                      addSavedAdvancedSearch(current, {
                        name: saveName,
                        query: rawQuery,
                        resources: resourcesValue,
                        namespaces: [...selectedNamespaces],
                      })
                    );
                    setSaveName('');
                  }
                }}
                fullWidth
              />
              <Button
                variant="contained"
                disabled={!saveName.trim() || !queryCanBeSaved}
                onClick={() => {
                  updateSearches(current =>
                    addSavedAdvancedSearch(current, {
                      name: saveName,
                      query: rawQuery,
                      resources: resourcesValue,
                      namespaces: [...selectedNamespaces],
                    })
                  );
                  setSaveName('');
                }}
              >
                <Trans>Save</Trans>
              </Button>
            </Box>
            {!queryCanBeSaved && (
              <Typography variant="caption" color="text.secondary">
                <Trans>Enter a query to save it.</Trans>
              </Typography>
            )}
          </Box>

          <Divider />

          {error && <Alert severity="error">{error}</Alert>}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {searches.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                <Trans>No saved searches yet.</Trans>
              </Typography>
            )}

            {searches.map(search => (
              <Box
                key={search.id}
                sx={theme => ({
                  border: '1px solid',
                  borderColor: theme.palette.divider,
                  borderRadius: 1,
                  padding: 1,
                  display: 'flex',
                  gap: 1,
                  alignItems: 'flex-start',
                })}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  {editId === search.id ? (
                    <TextField
                      label={t('Name')}
                      variant="outlined"
                      size="small"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && editName.trim()) {
                          updateSearches(current =>
                            renameSavedAdvancedSearch(current, search.id, editName)
                          );
                          setEditId(null);
                        }
                      }}
                      fullWidth
                    />
                  ) : (
                    <>
                      <LightTooltip title={search.name}>
                        <Typography variant="subtitle2" noWrap>
                          {search.name}
                        </Typography>
                      </LightTooltip>
                      <LightTooltip title={search.query}>
                        <Typography
                          component="pre"
                          variant="caption"
                          sx={{
                            color: 'text.secondary',
                            fontFamily: 'monospace',
                            margin: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {search.query}
                        </Typography>
                      </LightTooltip>
                    </>
                  )}
                </Box>

                {editId === search.id ? (
                  <>
                    <Tooltip title={<Trans>Save</Trans>}>
                      <span>
                        <IconButton
                          aria-label={t('Save')}
                          size="small"
                          disabled={!editName.trim()}
                          onClick={() => {
                            updateSearches(current =>
                              renameSavedAdvancedSearch(current, search.id, editName)
                            );
                            setEditId(null);
                          }}
                        >
                          <Icon icon="mdi:check" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={<Trans>Cancel</Trans>}>
                      <IconButton
                        aria-label={t('Cancel')}
                        size="small"
                        onClick={() => setEditId(null)}
                      >
                        <Icon icon="mdi:close" />
                      </IconButton>
                    </Tooltip>
                  </>
                ) : (
                  <>
                    <Tooltip title={<Trans>Restore</Trans>}>
                      <IconButton
                        aria-label={t('Restore')}
                        size="small"
                        onClick={() => restoreSearch(search)}
                      >
                        <Icon icon="mdi:restore" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={<Trans>Rename</Trans>}>
                      <IconButton
                        aria-label={t('Rename')}
                        size="small"
                        onClick={() => {
                          setEditId(search.id);
                          setEditName(search.name);
                        }}
                      >
                        <Icon icon="mdi:pencil" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={<Trans>Delete</Trans>}>
                      <IconButton
                        aria-label={t('Delete')}
                        size="small"
                        onClick={() =>
                          updateSearches(current => deleteSavedAdvancedSearch(current, search.id))
                        }
                      >
                        <Icon icon="mdi:delete" />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      </Popover>
    </>
  );
}

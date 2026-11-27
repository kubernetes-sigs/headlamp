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
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useCluster } from '../../lib/k8s';
import { createRouteURL } from '../../lib/router/createRouteURL';
import BackLink from '../common/BackLink';
import Empty from '../common/EmptyContent';
import ErrorBoundary from '../common/ErrorBoundary';
import { PageGrid } from '../common/Resource';
import SectionHeader from '../common/SectionHeader';
import { BUILTIN_VIEW_WIDGETS } from './builtinWidgets';
import { CustomViewColSpan, CustomViewWidgetInstance } from './storage';
import { useCustomViewsState } from './useCustomViews';
import { WidgetDialog } from './WidgetDialog';

function nextColSpan(current: CustomViewColSpan | undefined): CustomViewColSpan {
  if (current === 4) return 6;
  if (current === 6) return 12;
  return 4;
}

export default function ViewDetails() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation(['translation']);
  const activeCluster = useCluster() || '';
  const {
    views,
    widgetDefinitions,
    getWidgetDefinition,
    updateView,
    addWidgetToView,
    updateWidgetInView,
    removeWidgetFromView,
    moveWidgetInView,
  } = useCustomViewsState(BUILTIN_VIEW_WIDGETS);

  const view = views.find(v => v.id === id);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<CustomViewWidgetInstance | null>(null);
  const [editViewOpen, setEditViewOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (typeof document !== 'undefined' && !document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  const toggleFullscreen = useCallback(async () => {
    if (!isFullscreen) {
      setIsFullscreen(true);
      try {
        await containerRef.current?.requestFullscreen?.();
      } catch {
        // Fallback CSS fullscreen overlay stays active when native Fullscreen API is unavailable.
      }
    } else {
      setIsFullscreen(false);
      try {
        if (typeof document !== 'undefined' && document.fullscreenElement) {
          await document.exitFullscreen();
        }
      } catch {
        // Ignore browser exitFullscreen errors.
      }
    }
  }, [isFullscreen]);

  const handleExportView = () => {
    if (!view) return;
    const blob = new Blob([JSON.stringify(view, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${view.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'view'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!view) {
    return (
      <PageGrid>
        <BackLink to={createRouteURL('views', activeCluster ? { cluster: activeCluster } : {})} />
        <Empty>{t('translation|Custom view not found.')}</Empty>
      </PageGrid>
    );
  }

  return (
    <Box
      ref={containerRef}
      sx={
        isFullscreen
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: theme => theme.zIndex.modal - 1,
              bgcolor: 'background.default',
              overflow: 'auto',
              p: 3,
            }
          : undefined
      }
    >
      <PageGrid>
        {!isFullscreen && (
          <BackLink to={createRouteURL('views', activeCluster ? { cluster: activeCluster } : {})} />
        )}
        <SectionHeader
          title={view.name}
          subtitle={view.description}
          actions={[
            <Button
              key="add-widget"
              variant="contained"
              size="small"
              startIcon={<Icon icon="mdi:plus-circle-outline" />}
              onClick={() => setAddDialogOpen(true)}
            >
              {t('translation|Add Widget')}
            </Button>,
            <Tooltip key="edit-view" title={t('translation|Edit view details')}>
              <IconButton
                aria-label={t('translation|Edit view details')}
                onClick={() => {
                  setDraftName(view.name);
                  setDraftDescription(view.description ?? '');
                  setEditViewOpen(true);
                }}
              >
                <Icon icon="mdi:cog-outline" />
              </IconButton>
            </Tooltip>,
            <Tooltip key="export-view" title={t('translation|Export view JSON')}>
              <IconButton aria-label={t('translation|Export view JSON')} onClick={handleExportView}>
                <Icon icon="mdi:file-download-outline" />
              </IconButton>
            </Tooltip>,
            <Tooltip
              key="fullscreen"
              title={
                isFullscreen ? t('translation|Exit fullscreen') : t('translation|Enter fullscreen')
              }
            >
              <IconButton
                aria-label={
                  isFullscreen
                    ? t('translation|Exit fullscreen')
                    : t('translation|Enter fullscreen')
                }
                onClick={toggleFullscreen}
              >
                <Icon icon={isFullscreen ? 'mdi:fullscreen-exit' : 'mdi:arrow-expand-all'} />
              </IconButton>
            </Tooltip>,
          ]}
        />

        {view.widgets.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              {t('translation|This view has no widgets yet')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t(
                'translation|Add Kubernetes resource summaries, live logs, events, cluster metrics, or plugin widgets.'
              )}
            </Typography>
            <Button
              variant="contained"
              startIcon={<Icon icon="mdi:plus-circle-outline" />}
              onClick={() => setAddDialogOpen(true)}
            >
              {t('translation|Add Widget')}
            </Button>
          </Paper>
        ) : (
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {view.widgets.map((widget, index) => {
              const definition = getWidgetDefinition(widget.type);
              return (
                <Grid key={widget.id} item xs={12} md={widget.colSpan ?? 6}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1.5,
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                        borderBottom: 1,
                        borderColor: 'divider',
                        pb: 1,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                        {definition?.icon && <Icon icon={definition.icon} width={20} />}
                        <Typography variant="subtitle1" noWrap>
                          {widget.title}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                        <Tooltip title={t('translation|Move left')}>
                          <span>
                            <IconButton
                              size="small"
                              aria-label={t('translation|Move left')}
                              disabled={index === 0}
                              onClick={() =>
                                moveWidgetInView({
                                  viewId: view.id,
                                  widgetId: widget.id,
                                  direction: 'left',
                                })
                              }
                            >
                              <Icon icon="mdi:arrow-left" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={t('translation|Move right')}>
                          <span>
                            <IconButton
                              size="small"
                              aria-label={t('translation|Move right')}
                              disabled={index === view.widgets.length - 1}
                              onClick={() =>
                                moveWidgetInView({
                                  viewId: view.id,
                                  widgetId: widget.id,
                                  direction: 'right',
                                })
                              }
                            >
                              <Icon icon="mdi:chevron-right" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={t('translation|Cycle width')}>
                          <IconButton
                            size="small"
                            aria-label={t('translation|Cycle width')}
                            onClick={() =>
                              updateWidgetInView({
                                viewId: view.id,
                                widgetId: widget.id,
                                colSpan: nextColSpan(widget.colSpan),
                              })
                            }
                          >
                            <Icon icon="mdi:view-column" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t('translation|Edit widget')}>
                          <IconButton
                            size="small"
                            aria-label={t('translation|Edit widget')}
                            onClick={() => setEditingWidget(widget)}
                          >
                            <Icon icon="mdi:cog-outline" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t('translation|Remove widget')}>
                          <IconButton
                            size="small"
                            aria-label={t('translation|Remove widget')}
                            onClick={() =>
                              removeWidgetFromView({ viewId: view.id, widgetId: widget.id })
                            }
                          >
                            <Icon icon="mdi:close-circle" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>

                    <Box sx={{ flexGrow: 1, minHeight: 0 }}>
                      <ErrorBoundary
                        fallback={() => (
                          <Empty color="error">
                            {t('translation|Failed to render widget "{{title}}".', {
                              title: widget.title,
                            })}
                          </Empty>
                        )}
                      >
                        {definition ? (
                          definition.component({
                            widgetId: widget.id,
                            config: widget.config,
                            cluster: activeCluster || view.cluster || '',
                            onConfigChange: nextConfig =>
                              updateWidgetInView({
                                viewId: view.id,
                                widgetId: widget.id,
                                config: nextConfig,
                              }),
                          })
                        ) : (
                          <Empty>
                            {t(
                              'translation|Widget type "{{type}}" is unavailable. Enable the plugin providing this widget or remove it.',
                              { type: widget.type }
                            )}
                          </Empty>
                        )}
                      </ErrorBoundary>
                    </Box>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
        )}

        <WidgetDialog
          open={addDialogOpen || Boolean(editingWidget)}
          onClose={() => {
            setAddDialogOpen(false);
            setEditingWidget(null);
          }}
          cluster={activeCluster || view.cluster || ''}
          widgetDefinitions={widgetDefinitions}
          initialWidget={editingWidget}
          onSave={payload => {
            if (editingWidget) {
              updateWidgetInView({
                viewId: view.id,
                widgetId: editingWidget.id,
                title: payload.title,
                colSpan: payload.colSpan,
                config: payload.config,
              });
            } else {
              addWidgetToView({ viewId: view.id, widget: payload });
            }
          }}
        />

        <Dialog open={editViewOpen} onClose={() => setEditViewOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>{t('translation|Edit View')}</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField
                size="small"
                fullWidth
                required
                label={t('translation|View Name')}
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
              />
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={2}
                label={t('translation|Description')}
                value={draftDescription}
                onChange={e => setDraftDescription(e.target.value)}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditViewOpen(false)}>{t('translation|Cancel')}</Button>
            <Button
              variant="contained"
              disabled={!draftName.trim()}
              onClick={() => {
                updateView({ id: view.id, name: draftName, description: draftDescription });
                setEditViewOpen(false);
              }}
            >
              {t('translation|Save')}
            </Button>
          </DialogActions>
        </Dialog>
      </PageGrid>
    </Box>
  );
}

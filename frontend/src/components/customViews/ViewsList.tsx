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
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { useCluster } from '../../lib/k8s';
import { createRouteURL } from '../../lib/router/createRouteURL';
import { DateLabel } from '../common/Label';
import Link from '../common/Link';
import { PageGrid } from '../common/Resource';
import { SectionBox } from '../common/SectionBox';
import { BUILTIN_VIEW_WIDGETS } from './builtinWidgets';
import { createCustomViewId, CustomView, parseImportedCustomView } from './storage';
import { useCustomViewsState } from './useCustomViews';

export default function ViewsList() {
  const { t } = useTranslation(['translation']);
  const history = useHistory();
  const activeCluster = useCluster() || '';
  const { views, getWidgetDefinition, createView, deleteView, duplicateView, importView } =
    useCustomViewsState(BUILTIN_VIEW_WIDGETS);

  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState('');

  const [pendingDelete, setPendingDelete] = useState<CustomView | null>(null);

  const filteredViews = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return views;
    }

    return views.filter(
      view =>
        view.name.toLowerCase().includes(query) || view.description?.toLowerCase().includes(query)
    );
  }, [views, search]);

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }

    const id = createCustomViewId();
    createView({
      id,
      name: trimmed,
      description: newDescription,
      cluster: activeCluster || undefined,
    });
    setCreateOpen(false);
    setNewName('');
    setNewDescription('');
    history.push(
      createRouteURL('viewDetails', { id, ...(activeCluster ? { cluster: activeCluster } : {}) })
    );
  };

  const handleImport = () => {
    const parsed = parseImportedCustomView(importJson);
    if (!parsed) {
      setImportError(t('translation|Invalid view JSON. Expected an object with a "name" field.'));
      return;
    }

    importView(parsed);
    setImportOpen(false);
    setImportJson('');
    setImportError('');
  };

  return (
    <PageGrid>
      <SectionBox
        title={t('translation|Views')}
        headerProps={{
          headerStyle: 'main',
          actions: [
            <TextField
              key="search"
              size="small"
              placeholder={t('translation|Filter views')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />,
            <Button
              key="import"
              variant="outlined"
              size="small"
              startIcon={<Icon icon="mdi:file-document-plus" />}
              onClick={() => {
                setImportError('');
                setImportOpen(true);
              }}
            >
              {t('translation|Import')}
            </Button>,
            <Button
              key="create"
              variant="contained"
              size="small"
              startIcon={<Icon icon="mdi:plus-circle-outline" />}
              onClick={() => setCreateOpen(true)}
            >
              {t('translation|Create View')}
            </Button>,
          ],
        }}
      >
        {filteredViews.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" gutterBottom>
              {views.length === 0
                ? t('translation|No custom views yet')
                : t('translation|No views match your filter')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t(
                'translation|Create dashboards combining workloads, logs, events, cluster metrics, and plugin widgets in one place.'
              )}
            </Typography>
            {views.length === 0 && (
              <Button
                variant="contained"
                startIcon={<Icon icon="mdi:plus-circle-outline" />}
                onClick={() => setCreateOpen(true)}
              >
                {t('translation|Create View')}
              </Button>
            )}
          </Box>
        ) : (
          <Grid container spacing={2}>
            {filteredViews.map(view => (
              <Grid key={view.id} item xs={12} sm={6} md={4}>
                <Card
                  variant="outlined"
                  sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
                >
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" gutterBottom>
                      <Link
                        routeName="viewDetails"
                        params={{
                          id: view.id,
                          ...(activeCluster ? { cluster: activeCluster } : {}),
                        }}
                      >
                        {view.name}
                      </Link>
                    </Typography>
                    {view.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                        {view.description}
                      </Typography>
                    )}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
                      <Chip
                        size="small"
                        label={t('translation|{{count}} widgets', { count: view.widgets.length })}
                      />
                      {view.widgets.slice(0, 3).map(widget => {
                        const def = getWidgetDefinition(widget.type);
                        return (
                          <Chip
                            key={widget.id}
                            size="small"
                            variant="outlined"
                            label={def?.label ?? widget.title}
                          />
                        );
                      })}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {t('translation|Updated')}: <DateLabel date={view.updatedAt} />
                    </Typography>
                  </CardContent>
                  <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 1.5 }}>
                    <Button
                      size="small"
                      component={Link}
                      routeName="viewDetails"
                      params={{
                        id: view.id,
                        ...(activeCluster ? { cluster: activeCluster } : {}),
                      }}
                    >
                      {t('translation|Open')}
                    </Button>
                    <Box>
                      <Tooltip title={t('translation|Duplicate')}>
                        <IconButton
                          size="small"
                          aria-label={t('translation|Duplicate view')}
                          onClick={() => duplicateView({ id: view.id })}
                        >
                          <Icon icon="mdi:content-copy" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('translation|Delete')}>
                        <IconButton
                          size="small"
                          aria-label={t('translation|Delete view')}
                          onClick={() => setPendingDelete(view)}
                        >
                          <Icon icon="mdi:delete-outline" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </SectionBox>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('translation|Create View')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              size="small"
              fullWidth
              required
              label={t('translation|View Name')}
              placeholder={t('translation|e.g. Checkout Workload Dashboard')}
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
            <TextField
              size="small"
              fullWidth
              multiline
              minRows={2}
              label={t('translation|Description')}
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>{t('translation|Cancel')}</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newName.trim()}>
            {t('translation|Create')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={importOpen} onClose={() => setImportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('translation|Import View JSON')}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            minRows={6}
            sx={{ mt: 1 }}
            label={t('translation|View JSON')}
            value={importJson}
            error={Boolean(importError)}
            helperText={importError}
            onChange={e => {
              setImportJson(e.target.value);
              setImportError('');
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportOpen(false)}>{t('translation|Cancel')}</Button>
          <Button variant="contained" onClick={handleImport} disabled={!importJson.trim()}>
            {t('translation|Import')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} maxWidth="xs">
        <DialogTitle>{t('translation|Delete View')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('translation|Are you sure you want to delete view "{{name}}"?', {
              name: pendingDelete?.name ?? '',
            })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>{t('translation|Cancel')}</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (pendingDelete) {
                deleteView(pendingDelete.id);
                setPendingDelete(null);
              }
            }}
          >
            {t('translation|Delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </PageGrid>
  );
}

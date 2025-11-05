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

import Box, { BoxProps } from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import _ from 'lodash';
import { isValidElement, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory, useParams } from 'react-router-dom';
import { isElectron } from '../../../helpers/isElectron';
import { getCluster } from '../../../lib/cluster';
import { deletePlugin } from '../../../lib/k8s/api/v1/pluginsApi';
import { ConfigStore } from '../../../plugin/configStore';
import { PluginInfo } from '../../../plugin/pluginsSlice';
import { clusterAction } from '../../../redux/clusterActionSlice';
import { useTypedSelector } from '../../../redux/hooks';
import type { AppDispatch } from '../../../redux/stores/store';
import NotFoundComponent from '../../404';
import { SectionHeader } from '../../common';
import { ConfirmDialog } from '../../common/Dialog';
import ErrorBoundary from '../../common/ErrorBoundary';
import { SectionBox } from '../../common/SectionBox';
import { setNotifications } from '../Notifications/notificationsSlice';

const PluginSettingsDetailsInitializer = (props: { plugin: PluginInfo }) => {
  const { plugin } = props;
  const { t } = useTranslation(['translation']);
  const store = new ConfigStore(plugin.name);
  const pluginConf = store.useConfig();
  const config = pluginConf() as { [key: string]: any };
  const dispatch: AppDispatch = useDispatch();

  function handleSave(data: { [key: string]: any }) {
    store.set(data);
  }

  function handleDeleteConfirm() {
    const name = plugin.name.split('/').splice(-1)[0];

    dispatch(
      clusterAction(
        () =>
          deletePlugin(name).catch(err => {
            const msg = err instanceof Error ? err.message : t('Unknown error');
            dispatch(
              setNotifications({
                cluster: getCluster(),
                date: new Date().toISOString(),
                deleted: false,
                id: Math.random().toString(36).substring(2),
                message: t('Failed to delete plugin: {{ msg }}', { msg: msg }),
                seen: false,
              })
            );
            throw err;
          }),
        {
          startMessage: t('Deleting plugin {{ itemName }}...', { itemName: name }),
          cancelledMessage: t('Cancelled deletion of {{ itemName }}.', { itemName: name }),
          successMessage: t('Deleted plugin {{ itemName }}.', { itemName: name }),
          errorMessage: t('Error deleting plugin {{ itemName }}.', { itemName: name }),
        }
      )
    ).finally(() => {
      history.back();
    });
  }

  return (
    <PluginSettingsDetailsPure
      config={config}
      plugin={plugin}
      onSave={handleSave}
      onDelete={handleDeleteConfirm}
    />
  );
};

export default function PluginSettingsDetails() {
  const pluginSettings = useTypedSelector(state => state.plugins.pluginSettings);
  const { name, type } = useParams<{ name: string; type?: string }>();

  const plugin = useMemo(() => {
    const decodedName = decodeURIComponent(name);
    const decodedType = type ? decodeURIComponent(type) : undefined;

    // If type is specified, find exact match by name and type
    if (decodedType) {
      return pluginSettings.find(
        plugin => plugin.name === decodedName && (plugin.type || 'shipped') === decodedType
      );
    }

    // Otherwise, find by name only (backwards compatibility)
    return pluginSettings.find(plugin => plugin.name === decodedName);
  }, [pluginSettings, name, type]);

  if (!plugin) {
    return <NotFoundComponent />;
  }

  return <PluginSettingsDetailsInitializer plugin={plugin} />;
}

const ScrollableBox = (props: BoxProps) => (
  <Box
    sx={{
      overflowY: 'scroll',
      msOverflowStyle: 'none',
      scrollbarWidth: 'none',
      '&::-webkit-scrollbar': {
        display: 'none',
      },
    }}
    {...props}
  />
);

/**
 * Represents the properties expected by the PluginSettingsDetails component.
 *
 * @property {Object} [config] - Optional configuration settings for the plugin. This is an object that contains current configuration of the plugin.
 * @property {PluginInfo} plugin - Information about the plugin.
 * @property {(data: { [key: string]: any }) => void} [onSave] - Optional callback function that is called when the settings are saved. The function receives an object representing the updated configuration settings for the plugin.
 * @property {() => void} onDelete - Callback function that is called when the plugin is requested to be deleted. This function does not take any parameters and does not return anything.
 *
 * @see PluginInfo - Refer to the PluginInfo documentation for details on what this object should contain.
 */
export interface PluginSettingsDetailsPureProps {
  config?: { [key: string]: any };
  plugin: PluginInfo;
  onSave?: (data: { [key: string]: any }) => void;
  onDelete: () => void;
}

export function PluginSettingsDetailsPure(props: PluginSettingsDetailsPureProps) {
  const { config, plugin, onSave, onDelete } = props;
  const { t } = useTranslation(['translation']);
  const [data, setData] = useState<{ [key: string]: any } | undefined>(config);
  const [enableSaveButton, setEnableSaveButton] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const history = useHistory();
  const [author, name] = plugin.name.includes('@')
    ? plugin.name.substring(1).split(/\/(.+)/)
    : [null, plugin.name];

  useEffect(() => {
    if (!_.isEqual(config, data)) {
      setEnableSaveButton(true);
    } else {
      setEnableSaveButton(false);
    }
  }, [data, config]);

  function onDataChange(data: { [key: string]: any }) {
    setData(data);
  }

  async function handleSave() {
    if (onSave && data) {
      await onSave(data);
      history.push('/settings/plugins');
    }
  }

  function handleDelete() {
    setOpenDeleteDialog(true);
  }

  function handleDeleteConfirm() {
    onDelete();
  }

  async function handleCancel() {
    await setData(config);
    history.push('/settings/plugins');
  }

  let component;
  // Only show settings component if this plugin is actually loaded
  if (plugin.isLoaded !== false) {
    if (isValidElement(plugin.settingsComponent)) {
      component = plugin.settingsComponent;
    } else if (typeof plugin.settingsComponent === 'function') {
      const Comp = plugin.settingsComponent;
      if (plugin.displaySettingsComponentWithSaveButton) {
        component = <Comp onDataChange={onDataChange} data={data} />;
      } else {
        component = <Comp />;
      }
    } else {
      component = null;
    }
  } else {
    component = null;
  }

  return (
    <>
      <SectionBox
        aria-live="polite"
        title={
          <SectionHeader
            title={name}
            titleSideActions={[
              plugin.type && (
                <Chip
                  label={
                    plugin.type === 'development'
                      ? t('translation|Development')
                      : plugin.type === 'user'
                      ? t('translation|User-installed')
                      : t('translation|Shipped')
                  }
                  size="small"
                  color={
                    plugin.type === 'development'
                      ? 'primary'
                      : plugin.type === 'user'
                      ? 'info'
                      : 'default'
                  }
                />
              ),
              plugin.isLoaded === false && plugin.overriddenBy && (
                <Chip
                  label={t('translation|Not Loaded')}
                  size="small"
                  color="warning"
                  variant="outlined"
                />
              ),
            ]}
            subtitle={author ? `${t('translation|By')}: ${author}` : undefined}
            noPadding={false}
            headerStyle="subsection"
          />
        }
        backLink={'/settings/plugins'}
      >
        {plugin.description}
        {plugin.isLoaded === false && plugin.overriddenBy && (
          <Box mt={2} p={2} sx={{ bgcolor: 'warning.light', borderRadius: 1 }}>
            <Typography variant="body2">
              {t(
                'translation|This plugin is not currently loaded because a "{{type}}" version is being used instead.',
                {
                  type:
                    plugin.overriddenBy === 'development'
                      ? t('translation|development')
                      : plugin.overriddenBy === 'user'
                      ? t('translation|user-installed')
                      : t('translation|shipped'),
                }
              )}
            </Typography>
          </Box>
        )}
        <ScrollableBox style={{ height: '70vh' }} py={0}>
          <ConfirmDialog
            open={openDeleteDialog}
            title={t('translation|Delete Plugin')}
            description={t('translation|Are you sure you want to delete this plugin?')}
            handleClose={() => setOpenDeleteDialog(false)}
            onConfirm={() => handleDeleteConfirm()}
          />
          <ErrorBoundary>{component}</ErrorBoundary>
        </ScrollableBox>
      </SectionBox>
      <Box py={0}>
        <Stack
          direction="row"
          spacing={2}
          justifyContent="space-between"
          alignItems="center"
          sx={{ borderTop: '2px solid', borderColor: 'silver', padding: '10px' }}
        >
          <Stack direction="row" spacing={1}>
            {plugin.isLoaded !== false && plugin.displaySettingsComponentWithSaveButton && (
              <>
                <Button
                  variant="contained"
                  disabled={!enableSaveButton}
                  style={{ backgroundColor: 'silver', color: 'black' }}
                  onClick={handleSave}
                >
                  {t('translation|Save')}
                </Button>
                <Button style={{ color: 'silver' }} onClick={handleCancel}>
                  {t('translation|Cancel')}
                </Button>
              </>
            )}
          </Stack>
          {isElectron() && plugin.type !== 'shipped' ? (
            <Button variant="text" color="error" onClick={handleDelete}>
              {t('translation|Delete Plugin')}
            </Button>
          ) : null}
        </Stack>
      </Box>
    </>
  );
}

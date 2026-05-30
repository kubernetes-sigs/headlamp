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

import { Icon, InlineIcon } from '@iconify/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useSnackbar } from 'notistack';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import { sanitizeCssColor } from '../../../helpers/clusterAppearance';
import { isElectron } from '../../../helpers/isElectron';
import { useCluster, useClustersConf } from '../../../lib/k8s';
import { deleteCluster } from '../../../lib/k8s/api/v1/clusterApi';
import { setConfig } from '../../../redux/configSlice';
import ConfirmButton from '../../common/ConfirmButton';
import Empty from '../../common/EmptyContent';
import Link from '../../common/Link';
import Loader from '../../common/Loader';
import NameValueTable from '../../common/NameValueTable';
import SectionBox from '../../common/SectionBox';
import { ClusterNameEditor } from './ClusterNameEditor';
import ClusterSelector from './ClusterSelector';
import ColorPicker from './ColorPicker';
import IconPicker from './IconPicker';
import NodeShellSettings from './NodeShellSettings';
import PodDebugSettings from './PodDebugSettings';
import { useClusterSettings } from './useClusterSettings';
import { isValidNamespaceFormat } from './util';

export default function SettingsCluster() {
  const clusterConf = useClustersConf();
  const clusters = Object.values(clusterConf || {})
    .map(cluster => cluster.name)
    .sort((a, b) => a.localeCompare(b));
  const { t } = useTranslation(['translation']);
  const initialCluster = useCluster() || '';
  const [cluster, setCluster] = React.useState(initialCluster);

  const [clusterSettings, setClusterSettings] = useClusterSettings(cluster);

  const [newAllowedNamespace, setNewAllowedNamespace] = React.useState('');
  const [colorPickerOpen, setColorPickerOpen] = React.useState(false);
  const [iconPickerOpen, setIconPickerOpen] = React.useState(false);

  const theme = useTheme();

  const history = useHistory();
  const dispatch = useDispatch();
  const location = useLocation();
  const { enqueueSnackbar } = useSnackbar();

  const removeCluster = () => {
    deleteCluster(cluster || '')
      .then(config => {
        dispatch(setConfig(config));
        history.push('/');
      })
      .catch((err: Error) => {
        enqueueSnackbar(
          t('translation|Failed to delete cluster: {{ error }}', { error: err.message }),
          {
            variant: 'error',
            preventDuplicate: true,
          }
        );
      });
  };

  // check if cluster was loaded by user
  const removableCluster = React.useMemo(() => {
    if (!cluster) {
      return false;
    }

    const clusterInfo = (clusterConf && clusterConf[cluster]) || null;
    return clusterInfo?.meta_data?.source === 'dynamic_cluster';
  }, [cluster, clusterConf]);

  const appearanceAccentColor = sanitizeCssColor(clusterSettings.appearance?.accentColor) || '';
  const appearanceIcon = clusterSettings.appearance?.icon || '';

  function updateAppearance(patch: { accentColor?: string; icon?: string }) {
    setClusterSettings(s => ({
      ...s,
      appearance: { ...s.appearance, ...patch },
    }));
  }

  const clusterFromUrl = useMemo(
    () => new URLSearchParams(location.search).get('c'),
    [location.search]
  );

  React.useLayoutEffect(() => {
    if (clusterFromUrl && clusters.includes(clusterFromUrl)) {
      setCluster(clusterFromUrl);
    } else if (clusters.length > 0 && !clusterFromUrl) {
      history.replace(`/settings/cluster?c=${clusters[0]}`);
    } else {
      setCluster('');
    }
  }, [clusters, history, clusterFromUrl]);

  const clusterInfo = (clusterConf && clusterConf[cluster || '']) || null;
  const placeholderNamespace = clusterInfo?.meta_data?.namespace || 'default';
  const defaultNamespace = clusterSettings.defaultNamespace || '';

  const [defaultNamespaceInput, setDefaultNamespaceInput] = React.useState(defaultNamespace);
  React.useEffect(() => {
    setDefaultNamespaceInput(defaultNamespace);
  }, [defaultNamespace]);

  function storeNewAllowedNamespace(namespace: string) {
    setNewAllowedNamespace('');
    setClusterSettings(settings => {
      const newSettings = { ...settings };
      newSettings.allowedNamespaces = newSettings.allowedNamespaces || [];
      newSettings.allowedNamespaces.push(namespace);
      // Sort and avoid duplicates
      newSettings.allowedNamespaces = [...new Set(newSettings.allowedNamespaces)].sort();
      return newSettings;
    });
  }

  const isValidDefaultNamespace = isValidNamespaceFormat(defaultNamespaceInput);
  const isValidNewAllowedNamespace = isValidNamespaceFormat(newAllowedNamespace);
  const invalidNamespaceMessage = t(
    "translation|Namespaces must contain only lowercase alphanumeric characters or '-', and must start and end with an alphanumeric character."
  );

  // If we don't have yet a cluster name from the URL, we are still loading.
  if (!clusterFromUrl) {
    return <Loader title="Loading" />;
  }

  if (clusters.length === 0) {
    return (
      <>
        <SectionBox title={t('translation|Cluster Settings')} backLink />
        <Empty color={theme.palette.mode === 'dark' ? 'error.light' : 'error.main'}>
          {t('translation|There seem to be no clusters configured…')}
        </Empty>
      </>
    );
  }

  if (!cluster) {
    return (
      <>
        <SectionBox title={t('translation|Cluster Settings')} backLink>
          <Typography
            color={theme.palette.mode === 'dark' ? 'error.light' : 'error.main'}
            component="h3"
            variant="h6"
          >
            {t(
              'translation|Cluster {{ clusterName }} does not exist. Please select a valid cluster:',
              {
                clusterName: clusterFromUrl,
              }
            )}
          </Typography>
          <ClusterSelector currentCluster={cluster} clusters={clusters} />
        </SectionBox>
      </>
    );
  }

  const defaultNamespaceLabelID = 'default-namespace-label';
  const allowedNamespaceLabelID = 'allowed-namespace-label';
  const appearanceLabelID = 'cluster-appearance-label';
  const accentColorLabelID = 'accent-color-label';
  const clusterIconLabelID = 'cluster-icon-label';
  const colorButtonID = 'color-picker-button';
  const iconButtonID = 'icon-picker-button';

  return (
    <>
      <SectionBox title={t('translation|Cluster Settings')} backLink>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <ClusterSelector clusters={clusters} currentCluster={cluster} />
          <Link
            routeName="cluster"
            params={{ cluster: cluster }}
            tooltip={t('translation|Go to cluster')}
          >
            {t('translation|Go to cluster')}
          </Link>
        </Box>
        {isElectron() && (
          <ClusterNameEditor
            cluster={cluster}
            clusterConf={clusterConf}
            clusterSettings={clusterSettings}
            setClusterSettings={setClusterSettings}
          />
        )}
        <NameValueTable
          rows={[
            {
              name: (
                <Box>
                  <Typography id={appearanceLabelID}>{t('translation|Appearance')}</Typography>
                  <Typography variant="body2" color="textSecondary">
                    {t("translation|Stored in your browser's localStorage (per-browser setting).")}
                  </Typography>
                </Box>
              ),
              value: (
                <Box display="flex" flexDirection="column" gap={2} sx={{ minWidth: 280 }}>
                  {/* Color Picker */}
                  <Box>
                    <Typography
                      id={accentColorLabelID}
                      variant="subtitle2"
                      component="span"
                      sx={{ mb: 1 }}
                    >
                      {t('translation|Accent color')}
                    </Typography>
                    <Box display="flex" alignItems="center" gap={1}>
                      {appearanceAccentColor && (
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: 1,
                            backgroundColor: appearanceAccentColor,
                            border: `1px solid ${theme.palette.divider}`,
                          }}
                        />
                      )}
                      <Button
                        id={colorButtonID}
                        variant="outlined"
                        size="small"
                        onClick={() => setColorPickerOpen(true)}
                        startIcon={<Icon icon="mdi:palette" />}
                        aria-labelledby={`${appearanceLabelID} ${colorButtonID}`}
                      >
                        {appearanceAccentColor
                          ? t('translation|Change Color')
                          : t('translation|Choose Color')}
                      </Button>
                      {appearanceAccentColor && (
                        <IconButton
                          size="small"
                          onClick={() => updateAppearance({ accentColor: '' })}
                          aria-label={t('translation|Clear accent color')}
                        >
                          <Icon icon="mdi:close" />
                        </IconButton>
                      )}
                    </Box>
                  </Box>

                  {/* Icon Picker */}
                  <Box>
                    <Typography
                      id={clusterIconLabelID}
                      variant="subtitle2"
                      component="span"
                      sx={{ mb: 1 }}
                    >
                      {t('translation|Cluster icon')}
                    </Typography>
                    <Box display="flex" alignItems="center" gap={1}>
                      {appearanceIcon && <Icon icon={appearanceIcon} width={24} />}
                      <Button
                        id={iconButtonID}
                        variant="outlined"
                        size="small"
                        onClick={() => setIconPickerOpen(true)}
                        startIcon={<Icon icon="mdi:emoticon-outline" />}
                        aria-labelledby={`${appearanceLabelID} ${iconButtonID}`}
                      >
                        {appearanceIcon
                          ? t('translation|Change Icon')
                          : t('translation|Choose Icon')}
                      </Button>
                      {appearanceIcon && (
                        <IconButton
                          size="small"
                          onClick={() => updateAppearance({ icon: '' })}
                          aria-label={t('translation|Clear cluster icon')}
                        >
                          <Icon icon="mdi:close" />
                        </IconButton>
                      )}
                    </Box>
                  </Box>
                </Box>
              ),
            },
          ]}
        />
        <NameValueTable
          rows={[
            {
              name: t('translation|Default namespace'),
              nameID: defaultNamespaceLabelID,
              value: (
                <TextField
                  onChange={event => {
                    const value = event.target.value.replace(' ', '');
                    setDefaultNamespaceInput(value);
                    if (isValidNamespaceFormat(value) || value === '') {
                      setClusterSettings(s => ({ ...s, defaultNamespace: value }));
                    }
                  }}
                  value={defaultNamespaceInput}
                  placeholder={placeholderNamespace}
                  error={!isValidDefaultNamespace}
                  inputProps={{
                    'aria-labelledby': defaultNamespaceLabelID,
                  }}
                  helperText={
                    isValidDefaultNamespace
                      ? t(
                          'translation|The default namespace for e.g. when applying resources (when not specified directly).'
                        )
                      : invalidNamespaceMessage
                  }
                  variant="outlined"
                  size="small"
                  InputProps={{
                    sx: { maxWidth: 250 },
                  }}
                />
              ),
            },
            {
              name: (
                <Typography id={allowedNamespaceLabelID}>
                  {t('translation|Allowed namespaces')}
                </Typography>
              ),
              value: (
                <>
                  <TextField
                    onChange={event => {
                      let value = event.target.value;
                      value = value.replace(' ', '');
                      setNewAllowedNamespace(value);
                    }}
                    placeholder={t('glossary|Namespace')}
                    error={!isValidNewAllowedNamespace}
                    value={newAllowedNamespace}
                    helperText={
                      isValidNewAllowedNamespace
                        ? t(
                            'translation|The list of namespaces you are allowed to access in this cluster.'
                          )
                        : invalidNamespaceMessage
                    }
                    autoComplete="off"
                    inputProps={{
                      'aria-labelledby': allowedNamespaceLabelID,
                      form: {
                        autocomplete: 'off',
                      },
                    }}
                    variant="outlined"
                    size="small"
                    InputProps={{
                      endAdornment: (
                        <IconButton
                          onClick={() => {
                            storeNewAllowedNamespace(newAllowedNamespace);
                          }}
                          disabled={!newAllowedNamespace}
                          size="medium"
                          aria-label={t('translation|Add namespace')}
                        >
                          <InlineIcon icon="mdi:plus-circle" />
                        </IconButton>
                      ),
                      onKeyDown: event => {
                        if (event.key === 'Enter') {
                          storeNewAllowedNamespace(newAllowedNamespace);
                        }
                      },
                      autoComplete: 'off',
                      sx: { maxWidth: 250 },
                    }}
                  />
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      '& > *': {
                        margin: theme.spacing(0.5),
                      },
                      marginTop: theme.spacing(1),
                    }}
                  >
                    {(clusterSettings.allowedNamespaces || []).map(namespace => (
                      <Chip
                        key={namespace}
                        label={namespace}
                        size="small"
                        clickable={false}
                        onDelete={() => {
                          setClusterSettings(settings => {
                            const newSettings = { ...settings };
                            newSettings.allowedNamespaces = newSettings.allowedNamespaces?.filter(
                              ns => ns !== namespace
                            );
                            return newSettings;
                          });
                        }}
                      />
                    ))}
                  </Box>
                </>
              ),
            },
          ]}
        />
      </SectionBox>
      <NodeShellSettings
        cluster={cluster}
        clusterSettings={clusterSettings}
        setClusterSettings={setClusterSettings}
      />
      <PodDebugSettings
        cluster={cluster}
        clusterSettings={clusterSettings}
        setClusterSettings={setClusterSettings}
      />
      {removableCluster && isElectron() && (
        <Box pt={2} textAlign="right">
          <ConfirmButton
            color="secondary"
            onConfirm={() => removeCluster()}
            confirmTitle={t('translation|Remove Cluster')}
            confirmDescription={t(
              'translation|Are you sure you want to remove the cluster "{{ clusterName }}"?',
              { clusterName: cluster }
            )}
          >
            {t('translation|Remove Cluster')}
          </ConfirmButton>
        </Box>
      )}

      <ColorPicker
        open={colorPickerOpen}
        currentColor={appearanceAccentColor}
        onClose={() => setColorPickerOpen(false)}
        onSelectColor={color => updateAppearance({ accentColor: color })}
      />

      <IconPicker
        open={iconPickerOpen}
        currentIcon={appearanceIcon}
        onClose={() => setIconPickerOpen(false)}
        onSelectIcon={icon => updateAppearance({ icon })}
      />
    </>
  );
}

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
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import { getClusterAppearanceFromMeta, isValidCssColor } from '../../../helpers/clusterAppearance';
import {
  ClusterSettings,
  loadClusterSettings,
  storeClusterSettings,
} from '../../../helpers/clusterSettings';
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
import { isValidNamespaceFormat } from './util';

export default function SettingsCluster() {
  const clusterConf = useClustersConf();
  const clusters = Object.values(clusterConf || {}).map(cluster => cluster.name);
  const { t } = useTranslation(['translation']);
  const [defaultNamespace, setDefaultNamespace] = React.useState('default');
  const [userDefaultNamespace, setUserDefaultNamespace] = React.useState('');
  const [newAllowedNamespace, setNewAllowedNamespace] = React.useState('');
  const [clusterSettings, setClusterSettings] = React.useState<ClusterSettings | null>(null);
  const [cluster, setCluster] = React.useState(useCluster() || '');
  const clusterFromURLRef = React.useRef('');

  const [appearanceAccentColor, setAppearanceAccentColor] = React.useState<string>('');
  const [appearanceIcon, setAppearanceIcon] = React.useState<string>('');
  const [appearanceSaving, setAppearanceSaving] = React.useState(false);
  const [appearanceError, setAppearanceError] = React.useState<string>('');

  // Dialog states for pickers
  const [colorPickerOpen, setColorPickerOpen] = React.useState(false);
  const [iconPickerOpen, setIconPickerOpen] = React.useState(false);

  const theme = useTheme();

  const history = useHistory();
  const dispatch = useDispatch();
  const location = useLocation();

  const removeCluster = () => {
    deleteCluster(cluster || '')
      .then(config => {
        dispatch(setConfig(config));
        history.push('/');
      })
      .catch((err: Error) => {
        if (err.message === 'Not Found') {
          // TODO: create notification with error message
        }
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

  React.useEffect(() => {
    setClusterSettings(!!cluster ? loadClusterSettings(cluster || '') : null);
  }, [cluster]);

  React.useEffect(() => {
    // Load appearance from localStorage
    const appearance = getClusterAppearanceFromMeta(cluster || '');

    setAppearanceAccentColor(appearance.accentColor || '');
    setAppearanceIcon(appearance.icon || '');
    setAppearanceError('');
  }, [cluster]);

  React.useEffect(() => {
    const clusterInfo = (clusterConf && clusterConf[cluster || '']) || null;
    const clusterConfNs = clusterInfo?.meta_data?.namespace;
    if (!!clusterConfNs && clusterConfNs !== defaultNamespace) {
      setDefaultNamespace(clusterConfNs);
    }
  }, [cluster, clusterConf]);

  React.useEffect(() => {
    if (clusterSettings?.defaultNamespace !== userDefaultNamespace) {
      setUserDefaultNamespace(clusterSettings?.defaultNamespace || '');
    }

    // Avoid re-initializing settings as {} just because the cluster is not yet set.
    if (clusterSettings !== null) {
      storeClusterSettings(cluster || '', clusterSettings);
    }
  }, [cluster, clusterSettings]);

  React.useEffect(() => {
    let timeoutHandle: NodeJS.Timeout | null = null;

    if (isEditingDefaultNamespace()) {
      // We store the namespace after a timeout.
      timeoutHandle = setTimeout(() => {
        if (isValidNamespaceFormat(userDefaultNamespace)) {
          storeNewDefaultNamespace(userDefaultNamespace);
        }
      }, 1000);
    }

    return () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        clusterFromURLRef.current = '';
      }
    };
  }, [userDefaultNamespace]);

  React.useEffect(() => {
    const clusterFromUrl = new URLSearchParams(location.search).get('c');
    clusterFromURLRef.current = clusterFromUrl || '';

    if (clusterFromUrl && clusters.includes(clusterFromUrl)) {
      setCluster(clusterFromUrl);
    } else if (clusters.length > 0 && !clusterFromUrl) {
      history.replace(`/settings/cluster?c=${clusters[0]}`);
    } else {
      setCluster('');
    }
  }, [location.search, clusters]);

  function isEditingDefaultNamespace() {
    return clusterSettings?.defaultNamespace !== userDefaultNamespace;
  }

  function storeNewAllowedNamespace(namespace: string) {
    setNewAllowedNamespace('');
    setClusterSettings((settings: ClusterSettings | null) => {
      const newSettings = { ...(settings || {}) };
      newSettings.allowedNamespaces = newSettings.allowedNamespaces || [];
      newSettings.allowedNamespaces.push(namespace);
      // Sort and avoid duplicates
      newSettings.allowedNamespaces = [...new Set(newSettings.allowedNamespaces)].sort();
      return newSettings;
    });
  }

  function storeNewDefaultNamespace(namespace: string) {
    let actualNamespace = namespace;
    if (namespace === defaultNamespace) {
      actualNamespace = '';
      setUserDefaultNamespace(actualNamespace);
    }

    setClusterSettings((settings: ClusterSettings | null) => {
      const newSettings = { ...(settings || {}) };
      if (isValidNamespaceFormat(namespace)) {
        newSettings.defaultNamespace = actualNamespace;
      }
      return newSettings;
    });
  }

  const isValidDefaultNamespace = isValidNamespaceFormat(userDefaultNamespace);
  const isValidNewAllowedNamespace = isValidNamespaceFormat(newAllowedNamespace);
  const invalidNamespaceMessage = t(
    "translation|Namespaces must contain only lowercase alphanumeric characters or '-', and must start and end with an alphanumeric character."
  );

  // Wrapper to allow empty string (optional field)
  const isValidAccentColor = (color: string): boolean => !color || isValidCssColor(color);

  // If we don't have yet a cluster name from the URL, we are still loading.
  if (!clusterFromURLRef.current) {
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
                clusterName: clusterFromURLRef.current,
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
                          onClick={() => setAppearanceAccentColor('')}
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
                          onClick={() => setAppearanceIcon('')}
                          aria-label={t('translation|Clear cluster icon')}
                        >
                          <Icon icon="mdi:close" />
                        </IconButton>
                      )}
                    </Box>
                  </Box>

                  {!!appearanceError && (
                    <Typography
                      color={theme.palette.mode === 'dark' ? 'error.light' : 'error.main'}
                    >
                      {appearanceError}
                    </Typography>
                  )}
                  <Box textAlign="right">
                    <ConfirmButton
                      disabled={appearanceSaving || (!!appearanceAccentColor && !!appearanceError)}
                      onConfirm={() => {
                        if (!isValidAccentColor(appearanceAccentColor)) {
                          setAppearanceError(
                            t(
                              'translation|Accent color format is invalid. Use hex (#ff0000), rgb(), rgba(), or a CSS color name.'
                            )
                          );
                          return;
                        }

                        setAppearanceSaving(true);
                        setAppearanceError('');

                        try {
                          // Save appearance to localStorage via clusterSettings
                          setClusterSettings((settings: ClusterSettings | null) => {
                            const newSettings = { ...(settings || {}) };
                            newSettings.appearance = {
                              accentColor: appearanceAccentColor || undefined,
                              icon: appearanceIcon || undefined,
                            };
                            return newSettings;
                          });

                          // Force a re-render of components by dispatching a storage event
                          window.dispatchEvent(new Event('storage'));
                        } catch (err: any) {
                          setAppearanceError(err.message);
                        } finally {
                          setAppearanceSaving(false);
                        }
                      }}
                      confirmTitle={t('translation|Apply appearance')}
                      confirmDescription={t(
                        'translation|Apply appearance changes for "{{ clusterName }}"? This will be stored in your browser.',
                        { clusterName: cluster }
                      )}
                    >
                      {appearanceSaving ? t('translation|Applying...') : t('translation|Apply')}
                    </ConfirmButton>
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
                    let value = event.target.value;
                    value = value.replace(' ', '');
                    setUserDefaultNamespace(value);
                  }}
                  value={userDefaultNamespace}
                  placeholder={defaultNamespace}
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
                    endAdornment: isEditingDefaultNamespace() ? (
                      <Icon
                        width={24}
                        color={theme.palette.text.secondary}
                        icon="mdi:progress-check"
                      />
                    ) : (
                      <Icon width={24} icon="mdi:check-bold" />
                    ),
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
                    placeholder="namespace"
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
                      onKeyPress: event => {
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
                    {((clusterSettings || {}).allowedNamespaces || []).map(namespace => (
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
      <NodeShellSettings cluster={cluster} />
      <PodDebugSettings cluster={cluster} />
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
        onSelectColor={setAppearanceAccentColor}
        onError={setAppearanceError}
      />

      <IconPicker
        open={iconPickerOpen}
        currentIcon={appearanceIcon}
        onClose={() => setIconPickerOpen(false)}
        onSelectIcon={setAppearanceIcon}
      />
    </>
  );
}

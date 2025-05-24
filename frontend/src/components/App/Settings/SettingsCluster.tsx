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
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import {
  ClusterSettings,
  loadClusterSettings,
  storeClusterSettings,
} from '../../../helpers/clusterSettings';
import { isElectron } from '../../../helpers/isElectron';
import { useCluster, useClustersConf } from '../../../lib/k8s';
import { deleteCluster, parseKubeConfig, renameCluster } from '../../../lib/k8s/apiProxy';
import { setConfig, setStatelessConfig } from '../../../redux/configSlice';
import { findKubeconfigByClusterName, updateStatelessClusterKubeconfig } from '../../../stateless/';
import ConfirmButton from '../../common/ConfirmButton';
import Empty from '../../common/EmptyContent';
import Link from '../../common/Link';
import Loader from '../../common/Loader';
import NameValueTable from '../../common/NameValueTable';
import SectionBox from '../../common/SectionBox';
import NodeShellSettings from './NodeShellSettings';
import { isValidNamespaceFormat } from './util';

function isValidClusterNameFormat(name: string) {
  // We allow empty isValidClusterNameFormat just because that's the default value in our case.
  if (!name) {
    return true;
  }

  // Validates that the namespace is a valid DNS-1123 label and returns a boolean.
  // https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#dns-label-names
  const regex = new RegExp('^[a-z0-9]([-a-z0-9]*[a-z0-9])?$');
  return regex.test(name);
}

interface ClusterSelectorProps {
  currentCluster?: string;
  clusters: string[];
}

function ClusterSelector(props: ClusterSelectorProps) {
  const { currentCluster = '', clusters } = props;
  const history = useHistory();
  const { t } = useTranslation('glossary');

  return (
    <FormControl variant="outlined" margin="normal" size="small" sx={{ minWidth: 250 }}>
      <InputLabel id="settings--cluster-selector">{t('glossary|Cluster')}</InputLabel>
      <Select
        labelId="settings--cluster-selector"
        value={currentCluster}
        onChange={event => {
          history.replace(`/settings/cluster?c=${event.target.value}`);
        }}
        label={t('glossary|Cluster')}
        autoWidth
        aria-label={t('glossary|Cluster selector')}
      >
        {clusters.map(clusterName => (
          <MenuItem key={clusterName} value={clusterName}>
            {clusterName}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

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
  const [newClusterName, setNewClusterName] = React.useState(cluster || '');
  const theme = useTheme();

  const history = useHistory();
  const dispatch = useDispatch();
  const location = useLocation();

  const clusterInfo = (clusterConf && clusterConf[cluster || '']) || null;
  const source = clusterInfo?.meta_data?.source || '';

  const handleUpdateClusterName = (source: string) => {
    try {
      renameCluster(cluster || '', newClusterName, source)
        .then(async config => {
          if (cluster) {
            const kubeconfig = await findKubeconfigByClusterName(cluster);
            if (kubeconfig !== null) {
              await updateStatelessClusterKubeconfig(kubeconfig, newClusterName, cluster);
              // Make another request for updated kubeconfig
              const updatedKubeconfig = await findKubeconfigByClusterName(cluster);
              if (updatedKubeconfig !== null) {
                parseKubeConfig({ kubeconfig: updatedKubeconfig })
                  .then((config: any) => {
                    storeNewClusterName(newClusterName);
                    dispatch(setStatelessConfig(config));
                  })
                  .catch((err: Error) => {
                    console.error('Error updating cluster name:', err.message);
                  });
              }
            } else {
              dispatch(setConfig(config));
            }
          }
          history.push('/');
          window.location.reload();
        })
        .catch((err: Error) => {
          console.error('Error updating cluster name:', err.message);
        });
    } catch (error) {
      console.error('Error updating cluster name:', error);
    }
  };

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

    if (clusterSettings?.currentName !== cluster) {
      setNewClusterName(clusterSettings?.currentName || '');
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

  function storeNewClusterName(name: string) {
    let actualName = name;
    if (name === cluster) {
      actualName = '';
      setNewClusterName(actualName);
    }

    setClusterSettings((settings: ClusterSettings | null) => {
      const newSettings = { ...(settings || {}) };
      if (isValidClusterNameFormat(name)) {
        newSettings.currentName = actualName;
      }
      return newSettings;
    });
  }

  const isValidDefaultNamespace = isValidNamespaceFormat(userDefaultNamespace);
  const isValidCurrentName = isValidClusterNameFormat(newClusterName);
  const isValidNewAllowedNamespace = isValidNamespaceFormat(newAllowedNamespace);
  const invalidNamespaceMessage = t(
    "translation|Namespaces must contain only lowercase alphanumeric characters or '-', and must start and end with an alphanumeric character."
  );

  const invalidClusterNameMessage = t(
    "translation|Cluster name must contain only lowercase alphanumeric characters or '-', and must start and end with an alphanumeric character."
  );

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
          <ClusterSelector clusters={clusters} />
        </SectionBox>
      </>
    );
  }

  // Display the original name of the cluster if it was loaded from a kubeconfig file.
  function ClusterName() {
    const currentName = clusterInfo?.name;
    const originalName = clusterInfo?.meta_data?.originalName;
    const source = clusterInfo?.meta_data?.source;
    // Note: display original name is currently only supported for non dynamic clusters from kubeconfig sources.
    const displayOriginalName = source === 'kubeconfig' && originalName;

    return (
      <>
        <Typography>{t('translation|Name')}</Typography>
        {displayOriginalName && currentName !== displayOriginalName && (
          <Typography variant="body2" color="textSecondary">
            {t('translation|Original name: {{ originalName }}', {
              originalName: originalName,
            })}
          </Typography>
        )}
      </>
    );
  }

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
          <NameValueTable
            rows={[
              {
                name: <ClusterName />,
                value: (
                  <TextField
                    onChange={event => {
                      let value = event.target.value;
                      value = value.replace(' ', '');
                      setNewClusterName(value);
                    }}
                    value={newClusterName}
                    placeholder={cluster}
                    error={!isValidCurrentName}
                    helperText={
                      isValidCurrentName
                        ? t(
                            'translation|The current name of the cluster. You can define a custom name.'
                          )
                        : invalidClusterNameMessage
                    }
                    InputProps={{
                      endAdornment: (
                        <Box pt={2} textAlign="right">
                          <ConfirmButton
                            onConfirm={() => {
                              if (isValidCurrentName) {
                                handleUpdateClusterName(source);
                              }
                            }}
                            confirmTitle={t('translation|Change name')}
                            confirmDescription={t(
                              'translation|Are you sure you want to change the name for "{{ clusterName }}"?',
                              { clusterName: cluster }
                            )}
                            disabled={!newClusterName || !isValidCurrentName}
                          >
                            {t('translation|Apply')}
                          </ConfirmButton>
                        </Box>
                      ),
                      onKeyPress: event => {
                        if (event.key === 'Enter' && isValidCurrentName) {
                          handleUpdateClusterName(source);
                        }
                      },
                      autoComplete: 'off',
                      sx: { maxWidth: 250 },
                    }}
                  />
                ),
              },
            ]}
          />
        )}
        <NameValueTable
          rows={[
            {
              name: t('translation|Default namespace'),
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
              name: t('translation|Allowed namespaces'),
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
                    aria-label={t('translation|Allowed namespaces')}
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
    </>
  );
}

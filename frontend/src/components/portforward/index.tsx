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
import IconButton from '@mui/material/IconButton';
import MuiLink from '@mui/material/Link';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useSnackbar } from 'notistack';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { isDockerDesktop } from '../../helpers/isDockerDesktop';
import {
  listPortForward,
  startPortForward,
  stopOrDeletePortForward,
} from '../../lib/k8s/api/v1/portForward';
import { getCluster } from '../../lib/util';
import { StatusLabel } from '../common/Label';
import Link from '../common/Link';
import Loader from '../common/Loader';
import {
  PORT_FORWARD_RUNNING_STATUS,
  PORT_FORWARD_STOP_STATUS,
  PORT_FORWARDS_STORAGE_KEY,
} from '../common/Resource/PortForward';
import SectionBox from '../common/SectionBox';
import Table from '../common/Table';
import PortForwardStartDialog from './PortForwardStartDialog';

const enum PortForwardAction {
  Start = 'Start',
  Stop = 'Stop',
  Delete = 'Delete',
}

export default function PortForwardingList() {
  const [portforwards, setPortForwards] = React.useState<any[]>([]);
  const [portForwardInAction, setPortForwardInAction] = React.useState<any>(null);
  const [startDialogOpen, setStartDialogOpen] = React.useState(false);
  const [selectedForStart, setSelectedForStart] = React.useState<any | null>(null);
  const isMountedRef = React.useRef(true);
  const portForwardInActionRef = React.useRef(portForwardInAction);
  const { enqueueSnackbar } = useSnackbar();
  const cluster = getCluster();
  const { t, i18n } = useTranslation(['translation', 'glossary']);
  const optionsTranslated = React.useMemo(
    () => ({
      [PortForwardAction.Start]: t('translation|Start'),
      [PortForwardAction.Stop]: t('translation|Stop'),
      [PortForwardAction.Delete]: t('translation|Delete'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n.language]
  );
  const options = Object.keys(optionsTranslated) as (keyof typeof optionsTranslated)[];

  React.useEffect(() => {
    portForwardInActionRef.current = portForwardInAction;
  }, [portForwardInAction]);

  React.useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const setPortForwardInActionSafely = React.useCallback((value: any) => {
    portForwardInActionRef.current = value;

    if (!isMountedRef.current) {
      return;
    }

    setPortForwardInAction(value);
  }, []);

  const fetchPortForwardList = React.useCallback(
    (showError?: boolean, activePortForwardId?: any, clusterOverride?: string) => {
      const cluster = clusterOverride || getCluster();
      if (!cluster) return;
      const portForwardId = activePortForwardId ?? portForwardInActionRef.current?.id;

      // fetch port forwarding list
      return listPortForward(cluster)
        .then(portforwards => {
          const massagedPortForwards = Array.isArray(portforwards) ? [...portforwards] : [];
          massagedPortForwards.forEach((portforward: any) => {
            if (portForwardId === portforward.id) {
              const errorMsg = portforward.error || portforward.Error;
              if (errorMsg && showError && isMountedRef.current) {
                enqueueSnackbar(errorMsg, {
                  key: 'portforward-error',
                  preventDuplicate: true,
                  autoHideDuration: 3000,
                  variant: 'error',
                });
              }
            }
          });

          // sync portforwards from backend with localStorage
          const portforwardInStorage = localStorage.getItem(PORT_FORWARDS_STORAGE_KEY);
          let parsedPortForwards: any[] = [];
          try {
            const parsed = JSON.parse(portforwardInStorage || '[]');
            parsedPortForwards = Array.isArray(parsed) ? parsed : [];
          } catch {
            parsedPortForwards = [];
            localStorage.setItem(PORT_FORWARDS_STORAGE_KEY, JSON.stringify([]));
          }
          parsedPortForwards.forEach((portforward: any) => {
            const index = massagedPortForwards.findIndex((pf: any) => pf.id === portforward.id);
            if (index === -1) {
              portforward.status = PORT_FORWARD_STOP_STATUS;
              massagedPortForwards.push(portforward);
            }
          });
          localStorage.setItem(
            PORT_FORWARDS_STORAGE_KEY,
            JSON.stringify(
              // in the localStorage we store portforward status as stop
              // this is because the correct status is always present on the backend
              // the localStorage portforwards are used specifically when the user relaunches the app
              massagedPortForwards.map((portforward: any) => {
                const newPortforward = { ...portforward };
                newPortforward.status = PORT_FORWARD_STOP_STATUS;
                return newPortforward;
              })
            )
          );
          if (!isMountedRef.current) {
            return;
          }
          setPortForwards(massagedPortForwards);
        })
        .catch(error => {
          console.error('Error fetching port forwards:', error);
          if (!isMountedRef.current) {
            return;
          }
          if (showError) {
            const errorMessage =
              error instanceof Error ? error.message : typeof error === 'string' ? error : '';
            const displayMessage = errorMessage
              ? `${t('translation|Error fetching port forwards')}: ${errorMessage}`
              : t('translation|Error fetching port forwards');

            enqueueSnackbar(displayMessage, {
              key: 'portforward-list-error',
              preventDuplicate: true,
              autoHideDuration: 3000,
              variant: 'error',
            });
          }
        });
    },
    [enqueueSnackbar, t]
  );

  React.useEffect(() => {
    fetchPortForwardList();
  }, [fetchPortForwardList]);

  const handleAction = (option: string, portforward: any, closeMenu: () => void) => {
    closeMenu();
    if (!option || typeof option !== 'string') {
      return;
    }

    const { id, namespace, cluster } = portforward;

    if (option === PortForwardAction.Start) {
      let address = 'localhost';
      if (isDockerDesktop()) {
        address = '0.0.0.0';
      }
      setSelectedForStart({ ...portforward, cluster, namespace, address });
      setStartDialogOpen(true);
      return;
    }
    if (option === PortForwardAction.Stop) {
      setPortForwardInActionSafely({ ...portforward, loading: true });
      // stop portforward
      stopOrDeletePortForward(cluster, id, true).finally(() => {
        setPortForwardInActionSafely(null);
        // Always refresh the backend-backed port-forward list so localStorage
        // stays in sync even if the component unmounts before the request settles.
        fetchPortForwardList(true, id, cluster);
      });
    }
    if (option === PortForwardAction.Delete) {
      setPortForwardInActionSafely({ ...portforward, loading: true });
      // delete portforward
      stopOrDeletePortForward(cluster, id, false).finally(() => {
        setPortForwardInActionSafely(null);

        // remove portforward from storage too
        const portforwardInStorage = localStorage.getItem(PORT_FORWARDS_STORAGE_KEY);
        let parsedPortForwards: any[] = [];
        try {
          const parsed = JSON.parse(portforwardInStorage || '[]');
          parsedPortForwards = Array.isArray(parsed) ? parsed : [];
        } catch {
          parsedPortForwards = [];
        }
        const index = parsedPortForwards.findIndex((pf: any) => pf.id === id);
        if (index !== -1) {
          parsedPortForwards.splice(index, 1);
        }
        localStorage.setItem(PORT_FORWARDS_STORAGE_KEY, JSON.stringify(parsedPortForwards));

        // Always refresh the backend-backed port-forward list so localStorage
        // stays in sync even if the component unmounts before the request settles.
        fetchPortForwardList(true, id, cluster);
      });
    }
  };

  const PortForwardContextMenu = ({ portforward }: { portforward: any }) => {
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const menuId = `pf-actions-${portforward.id}`;

    const filteredOptions = options.filter(option => {
      if (portforward.error) {
        return option === PortForwardAction.Delete;
      }
      if (portforward.status === PORT_FORWARD_RUNNING_STATUS) {
        return option !== PortForwardAction.Start;
      } else if (portforward.status === PORT_FORWARD_STOP_STATUS) {
        return option !== PortForwardAction.Stop;
      }
      return true;
    });

    function closeMenu() {
      setAnchorEl(null);
    }

    return (
      <>
        <IconButton
          size="small"
          onClick={event => setAnchorEl(event.currentTarget)}
          aria-haspopup="menu"
          aria-controls={menuId}
          aria-label={t('Actions')}
        >
          <Icon icon="mdi:more-vert" />
        </IconButton>
        <Menu id={menuId} anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={closeMenu}>
          {filteredOptions.map(option => (
            <MenuItem key={option} onClick={() => handleAction(option, portforward, closeMenu)}>
              <ListItemText>{optionsTranslated[option]}</ListItemText>
            </MenuItem>
          ))}
        </Menu>
      </>
    );
  };

  function prepareStatusLabel(portforward: any) {
    if (portForwardInAction?.id === portforward.id && portForwardInAction.loading) {
      return <Loader noContainer title={t('translation|Loading port forwarding')} size={30} />;
    }
    const error = portforward.error;
    if (error) {
      return <StatusLabel status="error">{t('translation|Error')}</StatusLabel>;
    }
    return (
      <StatusLabel status={portforward.status === PORT_FORWARD_RUNNING_STATUS ? 'success' : ''}>
        {portforward.status}
      </StatusLabel>
    );
  }

  return (
    <SectionBox title={t('glossary|Port Forwarding')}>
      <Table
        columns={[
          {
            id: 'name',
            header: t('translation|Name'),
            accessorFn: portforward => portforward.service || portforward.pod,
            Cell: ({ row }) => {
              const portforward = row.original;
              const podOrService = portforward.service ? 'service' : 'pod';
              const name = portforward.service || portforward.pod;
              const namespace = portforward.serviceNamespace || portforward.namespace;
              return (
                <Link routeName={podOrService} params={{ name, namespace }}>
                  {name}
                </Link>
              );
            },
          },
          {
            id: 'namespace',
            header: t('glossary|Namespace'),
            accessorFn: portforward => portforward.serviceNamespace || portforward.namespace,
          },
          {
            id: 'kind',
            header: t('glossary|Kind'),
            accessorFn: portforward => (!!portforward.service ? 'Service' : 'Pod'),
          },
          {
            id: 'podPort',
            header: t('translation|Pod Port'),
            accessorFn: portforward => portforward.targetPort,
          },
          {
            id: 'localPort',
            header: t('translation|Local Port'),
            accessorFn: portforward => portforward.port,
            Cell: ({ row }) => {
              const portforward = row.original;
              return (
                <Box display={'flex'} alignItems="center">
                  <MuiLink
                    onClick={() => {
                      window.open(`http://localhost:${portforward.port}`, '_blank');
                    }}
                    sx={theme =>
                      portforward.status === PORT_FORWARD_RUNNING_STATUS
                        ? {
                            cursor: 'pointer',
                            marginRight: theme.spacing(1),
                          }
                        : {
                            pointerEvents: 'none',
                            color: theme.palette.text.disabled,
                          }
                    }
                  >
                    {portforward.port}
                    <InlineIcon icon={'mdi:open-in-new'} style={{ marginLeft: '4px' }} />
                  </MuiLink>
                </Box>
              );
            },
          },
          {
            id: 'status',
            header: t('translation|Status'),
            accessorFn: portforward => portforward.status,
            Cell: ({ row }) => prepareStatusLabel(row.original),
          },
          {
            id: 'actions',
            header: t('translation|Actions'),
            gridTemplate: 'min-content',
            muiTableBodyCellProps: { align: 'right' },
            accessorFn: portforward => portforward.status,
            Cell: ({ row }) => <PortForwardContextMenu portforward={row.original} />,
            enableSorting: false,
            enableColumnFilter: false,
          },
        ]}
        data={portforwards.filter((pf: any) => pf.cluster === cluster)}
        getRowId={row => row.id}
      />
      <PortForwardStartDialog
        open={startDialogOpen}
        defaultPort={selectedForStart?.port}
        podName={selectedForStart?.pod || selectedForStart?.service || ''}
        namespace={selectedForStart?.serviceNamespace || selectedForStart?.namespace || ''}
        containerPort={selectedForStart?.targetPort || ''}
        isDockerDesktop={isDockerDesktop()}
        onCancel={() => {
          setStartDialogOpen(false);
          setSelectedForStart(null);
        }}
        onConfirm={portInput => {
          if (!selectedForStart) return;

          const { cluster, namespace, pod, targetPort, service, serviceNamespace, id } =
            selectedForStart;
          const chosenPort = portInput || selectedForStart.port;
          const address = selectedForStart.address || 'localhost';

          setStartDialogOpen(false);
          setSelectedForStart(null);
          setPortForwardInActionSafely({ ...selectedForStart, loading: true });

          startPortForward(
            cluster,
            namespace,
            pod,
            targetPort,
            service,
            serviceNamespace,
            chosenPort,
            address,
            id
          )
            .then(() => {
              setPortForwardInActionSafely(null);
              // Always refresh so localStorage stays in sync regardless of mount state.
              fetchPortForwardList(true, id, cluster);
            })
            .catch(error => {
              setPortForwardInActionSafely(null);
              console.error('Error starting port forward:', error);
              if (!isMountedRef.current) {
                return;
              }
              const errorMessage =
                error instanceof Error ? error.message : typeof error === 'string' ? error : '';
              const displayMessage = errorMessage
                ? `${t('translation|Error starting port forward')}: ${errorMessage}`
                : t('translation|Error starting port forward');

              enqueueSnackbar(displayMessage, {
                key: 'portforward-error',
                preventDuplicate: true,
                variant: 'error',
              });
            });
        }}
      />
    </SectionBox>
  );
}

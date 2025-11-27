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
  const { enqueueSnackbar } = useSnackbar();
  const cluster = getCluster();
  const { t, i18n } = useTranslation(['translation', 'glossary']);
  const optionsTranslated = React.useMemo(
    () => ({
      [PortForwardAction.Start]: t('translation|Start'),
      [PortForwardAction.Stop]: t('translation|Stop'),
      [PortForwardAction.Delete]: t('translation|Delete'),
    }),
    [i18n.language]
  );
  const options = Object.keys(optionsTranslated) as (keyof typeof optionsTranslated)[];

  function fetchPortForwardList(showError?: boolean) {
    const cluster = getCluster();
    if (!cluster) return;

    // fetch port forwarding list
    listPortForward(cluster).then(portforwards => {
      const massagedPortForwards = portforwards === null ? [] : portforwards;
      massagedPortForwards.forEach((portforward: any) => {
        if (portForwardInAction?.id === portforward.id) {
          if (portforward.Error && showError) {
            enqueueSnackbar(portforward.Error, {
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
      const parsedPortForwards = JSON.parse(portforwardInStorage || '[]');
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
          // in the locaStorage we store portforward status as stop
          // this is because the correct status is always present on the backend
          // the localStorage portforwards are used specifically when the user relaunches the app
          massagedPortForwards.map((portforward: any) => {
            const newPortforward = { ...portforward };
            newPortforward.status = PORT_FORWARD_STOP_STATUS;
            return newPortforward;
          })
        )
      );
      setPortForwards(massagedPortForwards);
    });
  }
  React.useEffect(() => {
    fetchPortForwardList();
  }, []);

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
      setPortForwardInAction({ ...portforward, loading: true });
      // stop portforward
      stopOrDeletePortForward(cluster, id, true).finally(() => {
        setPortForwardInAction(null);
        // update portforward list item
        fetchPortForwardList(true);
      });
    }
    if (option === PortForwardAction.Delete) {
      setPortForwardInAction({ ...portforward, loading: true });
      // delete portforward
      stopOrDeletePortForward(cluster, id, false).finally(() => {
        setPortForwardInAction(null);

        // remove portforward from storage too
        const portforwardInStorage = localStorage.getItem(PORT_FORWARDS_STORAGE_KEY);
        const parsedPortForwards = JSON.parse(portforwardInStorage || '[]');
        const index = parsedPortForwards.findIndex((pf: any) => pf.id === id);
        if (index !== -1) {
          parsedPortForwards.splice(index, 1);
        }
        localStorage.setItem(PORT_FORWARDS_STORAGE_KEY, JSON.stringify(parsedPortForwards));

        // update portforward list item
        fetchPortForwardList(true);
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
          setPortForwardInAction({ ...selectedForStart, loading: true });

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
              setPortForwardInAction(null);
              fetchPortForwardList(true);
            })
            .catch(error => {
              setPortForwardInAction(null);
              console.log('Error starting port forward:', error);
            });
        }}
      />
    </SectionBox>
  );
}

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
import { Theme } from '@mui/material';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { matchPath, useLocation } from 'react-router-dom';
import { getCluster } from '../../lib/cluster';
import { testClusterHealth } from '../../lib/k8s/api/v1/clusterApi';
import { getRoute } from '../../lib/router/getRoute';
import { getRoutePath } from '../../lib/router/getRoutePath';
import Link from './Link';

// in ms
const NETWORK_STATUS_CHECK_TIME = 5000;

// Safety cap in case a reason is unexpectedly long.
const MAX_ERROR_DETAIL_LENGTH = 200;

function formatErrorDetail(error: null | string | boolean): string {
  if (typeof error !== 'string') {
    return '';
  }
  // Keep only the concise reason and drop the raw response body that clusterRequest
  // appends after " - " (e.g. the verbose "[+]ping ok [+]etcd ok…" healthz checklist).
  const detail = error.split(' - ')[0].replace(/\s+/g, ' ').trim();
  return detail.length > MAX_ERROR_DETAIL_LENGTH
    ? `${detail.slice(0, MAX_ERROR_DETAIL_LENGTH).trimEnd()}…`
    : detail;
}

export interface PureAlertNotificationProps {
  checkerFunction(): Promise<any>;
}

const ROUTES_WITHOUT_ALERT = ['login', 'token', 'settingsCluster'];

export function PureAlertNotification({ checkerFunction }: PureAlertNotificationProps) {
  const [networkStatusCheckTimeFactor, setNetworkStatusCheckTimeFactor] = React.useState(0);
  const [error, setError] = React.useState<null | string | boolean>(null);
  const [dismissed, setDismissed] = React.useState(false);

  const { t } = useTranslation();
  const { pathname } = useLocation();

  function registerSetInterval(): NodeJS.Timeout {
    return setInterval(() => {
      if (!window.navigator.onLine) {
        setError(t('translation|Offline') as string);
        return;
      }

      if (!getCluster()) {
        setError(null);
        return;
      }

      checkerFunction()
        .then(() => {
          setError(false);
        })
        .catch(err => {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setNetworkStatusCheckTimeFactor(
            (networkStatusCheckTimeFactor: number) => networkStatusCheckTimeFactor + 1
          );
        });
    }, (networkStatusCheckTimeFactor + 1) * NETWORK_STATUS_CHECK_TIME);
  }

  React.useEffect(() => {
    if (!getCluster()) {
      setError(null);
    }
  }, [pathname]);

  // Show the bar again whenever the error changes, even if it was dismissed before.
  React.useEffect(() => {
    setDismissed(false);
  }, [error]);

  React.useEffect(
    () => {
      const id = registerSetInterval();
      return () => clearInterval(id);
    },
    // eslint-disable-next-line
    [networkStatusCheckTimeFactor]
  );

  const showOnRoute = React.useMemo(() => {
    for (const routeName of ROUTES_WITHOUT_ALERT) {
      const maybeRoute = getRoute(routeName);
      if (maybeRoute) {
        const routePath = getRoutePath(maybeRoute);
        if (matchPath(pathname, routePath)?.isExact) {
          return false;
        }
      } else {
        console.error(`Can't find ${routeName} route`);
      }
    }
    return true;
  }, [pathname]);

  if (!error || !showOnRoute || dismissed) {
    return null;
  }

  const errorDetail = formatErrorDetail(error);

  return (
    <Alert
      variant="filled"
      severity="error"
      sx={theme => ({
        color: theme.palette.common.white,
        background: theme.palette.error.main,
        textAlign: 'center',
        display: 'flex',
        paddingTop: theme.spacing(0.5),
        paddingBottom: theme.spacing(1),
        paddingRight: theme.spacing(2),
        justifyContent: 'center',
        // Stick within the content area so it never covers the window controls.
        position: 'sticky',
        zIndex: theme.zIndex.appBar - 1,
        top: '0',
        alignItems: 'center',
        marginLeft: 'auto',
        marginRight: 'auto',
        width: 'fit-content',
        maxWidth: '100%',
      })}
      action={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Button
            sx={theme => ({
              color: theme.palette.error.main,
              borderColor: theme.palette.error.main,
              background: theme.palette.common.white,
              lineHeight: theme.typography.body2.lineHeight,
              '&:hover': {
                color: theme.palette.common.white,
                borderColor: theme.palette.common.white,
                background: theme.palette.error.dark,
              },
            })}
            onClick={() => setNetworkStatusCheckTimeFactor(0)}
            size="small"
          >
            {t('translation|Try Again')}
          </Button>
          <IconButton
            aria-label={t('translation|Dismiss')}
            title={t('translation|Dismiss')}
            size="small"
            sx={theme => ({ color: theme.palette.common.white })}
            onClick={() => setDismissed(true)}
          >
            <Icon icon="mdi:close" />
          </IconButton>
        </Box>
      }
    >
      <Typography
        variant="body2"
        sx={theme => ({
          paddingTop: theme.spacing(0.5),
          fontWeight: 'bold',
          fontSize: '16px',
        })}
      >
        {t('translation|Lost connection to the cluster.')}
      </Typography>
      {errorDetail && (
        <Typography
          variant="body2"
          sx={theme => ({ paddingTop: theme.spacing(0.5), wordBreak: 'break-word' })}
        >
          {errorDetail}
        </Typography>
      )}
      <Link
        routeName="settingsCluster"
        sx={(theme: Theme) => ({
          color: theme.palette.common.white,
          textDecorationColor: theme.palette.common.white,
          fontWeight: 'bold',
        })}
      >
        {t('translation|Check cluster settings')}
      </Link>
    </Alert>
  );
}

export default function AlertNotification() {
  return <PureAlertNotification checkerFunction={testClusterHealth} />;
}

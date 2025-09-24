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

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { matchPath, useLocation } from 'react-router-dom';
import { getCluster } from '../../lib/cluster';
import { testClusterHealth } from '../../lib/k8s/api/v1/clusterApi';
import { getRoute } from '../../lib/router/getRoute';
import { getRoutePath } from '../../lib/router/getRoutePath';

// in ms
const NETWORK_STATUS_CHECK_TIME = 5000;

export interface PureAlertNotificationProps {
  checkerFunction(): Promise<any>;
}

// Routes where we don't show the alert notification.
// Because maybe they already offer context about the cluster health or
// some other reason.
const ROUTES_WITHOUT_ALERT = ['login', 'token', 'settingsCluster'];

export function PureAlertNotification({ checkerFunction }: PureAlertNotificationProps) {
  const [networkStatusCheckTimeFactor, setNetworkStatusCheckTimeFactor] = React.useState(0);
  const [error, setError] = React.useState<null | string | boolean>(null);
  const [intervalID, setIntervalID] = React.useState<NodeJS.Timeout | null>(null);
  const { t } = useTranslation();
  const { pathname } = useLocation();

  function registerSetInterval(): NodeJS.Timeout {
    return setInterval(() => {
      if (!window.navigator.onLine) {
        setError(t('translation|Offline') as string);
        return;
      }

      // Don't check for the cluster health if we are not on a cluster route.
      if (!getCluster()) {
        setError(null);
        return;
      }

      checkerFunction()
        .then(() => {
          setError(false);
        })
        .catch(err => {
          const error = new Error(err);
          setError(error.message);
          setNetworkStatusCheckTimeFactor(
            (networkStatusCheckTimeFactor: number) => networkStatusCheckTimeFactor + 1
          );
        });
    }, (networkStatusCheckTimeFactor + 1) * NETWORK_STATUS_CHECK_TIME);
  }

  React.useEffect(
    () => {
      const id = registerSetInterval();
      setIntervalID(id);
      return () => clearInterval(id);
    },
    // eslint-disable-next-line
    []
  );

  // Make sure we do not show the alert notification if we are not on a cluster route.
  React.useEffect(() => {
    if (!getCluster()) {
      setError(null);
    }
  }, [pathname]);

  React.useEffect(
    () => {
      if (intervalID) {
        clearInterval(intervalID);
      }
      const id = registerSetInterval();
      setIntervalID(id);
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

  if (!error || !showOnRoute) {
    return null;
  }

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
        paddingRight: theme.spacing(3),
        justifyContent: 'center',
        position: 'fixed',
        zIndex: theme.zIndex.snackbar + 1,
        top: '0',
        alignItems: 'center',
        left: '50%',
        width: 'auto',
        transform: 'translateX(-50%)',
      })}
      action={
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
    </Alert>
  );
}

export default function AlertNotification() {
  return <PureAlertNotification checkerFunction={testClusterHealth} />;
}

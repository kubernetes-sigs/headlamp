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
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import type { Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { matchPath, useLocation } from 'react-router-dom';
import { getCluster } from '../../lib/cluster';
import { testClusterHealth } from '../../lib/k8s/api/v1/clusterApi';
import type { ApiError } from '../../lib/k8s/api/v2/ApiError';
import { getRoute } from '../../lib/router/getRoute';
import { getRoutePath } from '../../lib/router/getRoutePath';
import Link from './Link';

// in ms
const NETWORK_STATUS_CHECK_TIME = 5000;

// Upper bound for the failure backoff, so a recovery is never more than
// (MAX_BACKOFF_FACTOR + 1) * NETWORK_STATUS_CHECK_TIME away.
const MAX_BACKOFF_FACTOR = 6;

// Statuses that mean "not authenticated (yet)" rather than "cluster unreachable".
// The auth routes take care of these, see AuthRoute.
const AUTH_ERROR_STATUSES = [401, 403];

// Safety cap in case a reason is unexpectedly long.
const MAX_ERROR_DETAIL_LENGTH = 200;

function formatErrorDetail(error: null | string | boolean): string {
  if (typeof error !== 'string') {
    return '';
  }
  // Keep only the concise reason and drop the raw response body that clusterRequest
  // appends after " - " (e.g. the verbose "[+]ping ok [+]etcd ok…" healthz checklist).
  const separator = ' - ';
  const healthPrefixIndex = error.indexOf(' is not healthy: ');
  const separatorIndex = error.indexOf(separator, healthPrefixIndex >= 0 ? healthPrefixIndex : 0);
  const concise = separatorIndex >= 0 ? error.slice(0, separatorIndex) : error;
  const detail = concise.replace(/\s+/g, ' ').trim();
  return detail.length > MAX_ERROR_DETAIL_LENGTH
    ? `${detail.slice(0, MAX_ERROR_DETAIL_LENGTH).trimEnd()}…`
    : detail;
}

export interface PureAlertNotificationProps {
  checkerFunction(): Promise<any>;
}

const ROUTES_WITHOUT_HEALTH_CHECK = ['login', 'token', 'oidcAuth', 'settingsCluster'];

export function PureAlertNotification({ checkerFunction }: PureAlertNotificationProps) {
  const [error, setError] = React.useState<null | string | boolean>(null);
  const [dismissed, setDismissed] = React.useState(false);
  const [retryCount, setRetryCount] = React.useState(0);

  const { t } = useTranslation();
  const { pathname } = useLocation();

  const cluster = getCluster();

  const checkerRef = React.useRef(checkerFunction);
  React.useEffect(() => {
    checkerRef.current = checkerFunction;
  }, [checkerFunction]);

  const retry = React.useCallback(() => setRetryCount(count => count + 1), []);

  // A health check cannot be aborted, so a route change or a "Try Again" restarts the
  // effect below while a request may still be open. Every check is chained onto this
  // promise, which keeps at most one /healthz request in flight and queues the next one
  // behind it instead of piling overlapping requests up.
  const inFlightRef = React.useRef<Promise<void>>(Promise.resolve());

  // The auth routes cannot answer a health check yet: polling them only piles up
  // transient failures whose backoff then delays the recovery.
  const showOnRoute = React.useMemo(() => {
    for (const routeName of ROUTES_WITHOUT_HEALTH_CHECK) {
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

  React.useEffect(() => {
    if (!cluster || !showOnRoute) {
      setError(null);
      return;
    }

    let cancelled = false;
    let timeoutId: NodeJS.Timeout | undefined;
    let backoffFactor = 0;

    function scheduleNextCheck() {
      if (cancelled) {
        return;
      }
      const factor = Math.min(backoffFactor, MAX_BACKOFF_FACTOR);
      timeoutId = setTimeout(runCheck, (factor + 1) * NETWORK_STATUS_CHECK_TIME);
    }

    async function runCheck() {
      if (cancelled) {
        return;
      }

      if (!window.navigator.onLine) {
        setError(t('translation|Offline') as string);
        scheduleNextCheck();
        return;
      }

      // Queued rather than started right away; a check whose effect was torn down while
      // it waited for its turn resolves to nothing instead of sending a request.
      const check = inFlightRef.current.then(() => (cancelled ? undefined : checkerRef.current()));
      inFlightRef.current = check.then(
        () => undefined,
        () => undefined
      );

      try {
        await check;
        if (cancelled) {
          return;
        }
        setError(false);
        backoffFactor = 0;
      } catch (err) {
        if (cancelled) {
          return;
        }
        const status = (err as ApiError)?.status;
        if (status !== undefined && AUTH_ERROR_STATUSES.includes(status)) {
          setError(null);
        } else {
          setError(err instanceof Error ? err.message : String(err));
          backoffFactor += 1;
        }
      }

      scheduleNextCheck();
    }

    // Check right away so the banner reflects the current state instead of the
    // one from before the last route change, login or connectivity event.
    runCheck();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [cluster, pathname, showOnRoute, retryCount, t]);

  React.useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        retry();
      }
    }

    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [retry]);

  // Show the bar again whenever the error changes, even if it was dismissed before.
  React.useEffect(() => {
    setDismissed(false);
  }, [error]);

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
            onClick={retry}
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
      {getCluster() && (
        <Link
          routeName="settingsCluster"
          params={{ cluster: getCluster()! }}
          sx={(theme: Theme) => ({
            color: theme.palette.common.white,
            textDecorationColor: theme.palette.common.white,
            fontWeight: 'bold',
          })}
        >
          {t('translation|Check cluster settings')}
        </Link>
      )}
    </Alert>
  );
}

export default function AlertNotification() {
  return <PureAlertNotification checkerFunction={testClusterHealth} />;
}

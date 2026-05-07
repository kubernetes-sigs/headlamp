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
import type { ClusterMeResult } from '../../lib/auth';
import { fetchClusterMe, logout } from '../../lib/auth';
import { getCluster } from '../../lib/cluster';
import { getRoute } from '../../lib/router/getRoute';
import { getRoutePath } from '../../lib/router/getRoutePath';

/** How often to poll the /clusters/:cluster/me endpoint (ms). */
const POLL_INTERVAL_MS = 60 * 1000;

/** Show a warning banner when fewer than this many seconds remain before expiry. */
const WARNING_BEFORE_EXPIRY_SECONDS = 2 * 60;

/** Routes where the banner is suppressed — these pages handle auth state themselves. */
const ROUTES_WITHOUT_EXPIRY_CHECK = ['login', 'token', 'settingsCluster'];

export interface PureTokenExpiryNotificationProps {
  /** Injected fetch function so tests can control responses without hitting the network. */
  fetchClusterMeFn: (cluster: string) => Promise<ClusterMeResult>;
}

/**
 * Polls the Headlamp /clusters/:cluster/me endpoint and shows a banner when the
 * session token is about to expire or has already expired.
 *
 * Exported as `PureTokenExpiryNotification` so it can be unit-tested with a
 * mocked fetch function.
 */
export function PureTokenExpiryNotification({
  fetchClusterMeFn,
}: PureTokenExpiryNotificationProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const clusterName = getCluster();

  const [tokenExpiry, setTokenExpiry] = React.useState<number | null>(null);
  const [tokenExpired, setTokenExpired] = React.useState(false);
  // Tracks wall-clock seconds; updated every second once we have an expiry to count down.
  const [now, setNow] = React.useState(() => Math.floor(Date.now() / 1000));

  // Restart the poller whenever the cluster changes.
  React.useEffect(() => {
    setTokenExpiry(null);
    setTokenExpired(false);
    setNow(Math.floor(Date.now() / 1000));

    const cluster = clusterName;
    if (!cluster) {
      return;
    }

    let mounted = true;

    const check = async () => {
      if (!mounted) return;
      const result = await fetchClusterMeFn(cluster);
      if (!mounted) return;

      if (result.tokenExpired) {
        setTokenExpired(true);
      } else if (result.data?.tokenExpiry !== null && result.data?.tokenExpiry !== undefined) {
        setTokenExpiry(result.data.tokenExpiry);
      }
    };

    // Run once immediately, then on the regular interval.
    check();
    const id = setInterval(check, POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [clusterName, fetchClusterMeFn]);

  // Keep `now` in sync with wall-clock time so the countdown text is live.
  // Defer the interval until the warning window begins to avoid ticking for
  // hours when the token has a long lifetime.
  React.useEffect(() => {
    if (tokenExpiry === null) return;

    const secondsLeft = tokenExpiry - Math.floor(Date.now() / 1000);
    let intervalId: ReturnType<typeof setInterval> | null = null;

    if (secondsLeft <= WARNING_BEFORE_EXPIRY_SECONDS) {
      intervalId = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
      return () => clearInterval(intervalId!);
    }

    const delay = (secondsLeft - WARNING_BEFORE_EXPIRY_SECONDS) * 1000;
    const timeoutId = setTimeout(() => {
      setNow(Math.floor(Date.now() / 1000));
      intervalId = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId !== null) clearInterval(intervalId);
    };
  }, [tokenExpiry]);

  // Detect local expiry between polls so logout happens immediately rather
  // than waiting up to POLL_INTERVAL_MS after the token has already expired.
  React.useEffect(() => {
    if (tokenExpiry !== null && now >= tokenExpiry && !tokenExpired) {
      setTokenExpired(true);
    }
  }, [now, tokenExpiry, tokenExpired]);

  // Auto-logout as soon as we know the token is expired (either from the
  // backend poll or from the local clock check above).
  React.useEffect(() => {
    if (!tokenExpired) return;
    if (clusterName) {
      logout(clusterName);
    }
  }, [tokenExpired, clusterName]);

  const showOnRoute = React.useMemo(() => {
    for (const routeName of ROUTES_WITHOUT_EXPIRY_CHECK) {
      const maybeRoute = getRoute(routeName);
      if (!maybeRoute) continue;
      if (matchPath(pathname, getRoutePath(maybeRoute))?.isExact) return false;
    }
    return true;
  }, [pathname]);

  if (!showOnRoute || !getCluster()) {
    return null;
  }

  if (tokenExpired) {
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
      >
        <Typography
          variant="body2"
          sx={theme => ({
            paddingTop: theme.spacing(0.5),
            fontWeight: 'bold',
            fontSize: '16px',
          })}
        >
          {t('translation|Session expired. Logging out…')}
        </Typography>
      </Alert>
    );
  }

  const secondsLeft = tokenExpiry !== null ? tokenExpiry - now : null;
  const isExpiring =
    secondsLeft !== null && secondsLeft > 0 && secondsLeft <= WARNING_BEFORE_EXPIRY_SECONDS;

  if (!isExpiring) {
    return null;
  }

  const minutes = Math.floor(secondsLeft! / 60);
  const seconds = secondsLeft! % 60;
  const timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`;

  return (
    <Alert
      variant="filled"
      severity="warning"
      sx={theme => ({
        color: theme.palette.common.white,
        background: theme.palette.warning.main,
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
          size="small"
          sx={theme => ({
            color: theme.palette.warning.main,
            borderColor: theme.palette.warning.main,
            background: theme.palette.common.white,
            lineHeight: theme.typography.body2.lineHeight,
            '&:hover': {
              color: theme.palette.common.white,
              borderColor: theme.palette.common.white,
              background: theme.palette.warning.dark,
            },
          })}
          onClick={() => {
            const cluster = getCluster();
            if (cluster) {
              logout(cluster);
            }
          }}
        >
          {t('translation|Log out')}
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
        {t('translation|Session expires in {{time}}', { time: timeStr })}
      </Typography>
    </Alert>
  );
}

export default function TokenExpiryNotification() {
  return <PureTokenExpiryNotification fetchClusterMeFn={fetchClusterMe} />;
}

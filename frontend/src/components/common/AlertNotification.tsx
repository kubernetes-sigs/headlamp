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
import { getRoute } from '../../lib/router/getRoute';
import { getRoutePath } from '../../lib/router/getRoutePath';
import { useTypedSelector } from '../../redux/hooks';
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
  /**
   * When true, the alert is suppressed. Used while a cluster is being prepared
   * by pre-open hooks (e.g. a proxy is still starting), so the transient
   * unreachability during connect doesn't flash a "Lost connection" banner.
   */
  suppress?: boolean;
}

const ROUTES_WITHOUT_ALERT = ['login', 'token', 'settingsCluster'];

export function PureAlertNotification({ checkerFunction, suppress }: PureAlertNotificationProps) {
  const [networkStatusCheckTimeFactor, setNetworkStatusCheckTimeFactor] = React.useState(0);
  const [error, setError] = React.useState<null | string | boolean>(null);
  const [dismissed, setDismissed] = React.useState(false);

  const { t } = useTranslation();
  const { pathname } = useLocation();

  function registerSetInterval(isStale: () => boolean): NodeJS.Timeout {
    return setInterval(() => {
      // While the cluster is being prepared (proxy starting, etc.) transient
      // unreachability is expected — don't alarm the user.
      if (suppress) {
        setError(null);
        return;
      }

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
          // A check whose effect has been torn down (suppression toggled, or the
          // backoff re-registered the interval) describes a moment that has
          // passed -- writing it back would resurrect state we deliberately
          // cleared, and bump the backoff on the way.
          if (isStale()) {
            return;
          }
          setError(false);
          // Reset the backoff so polling returns to the normal cadence once the
          // cluster recovers; otherwise the interval stays elevated for the rest
          // of the session and the banner lingers after connectivity is restored.
          setNetworkStatusCheckTimeFactor(0);
        })
        .catch(err => {
          if (isStale()) {
            return;
          }
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

  // Preparation start: drop any standing error immediately rather than waiting
  // for the next poll tick. Preparation end: don't fall back on a verdict formed
  // before the cluster was reachable -- re-check now, because the next scheduled
  // poll can be 10s+ away once the backoff has grown.
  const wasSuppressed = React.useRef(false);
  React.useEffect(() => {
    const preparationEnded = wasSuppressed.current && !suppress;
    wasSuppressed.current = !!suppress;

    if (suppress) {
      setError(null);
      return;
    }

    // On first render there is no earlier verdict to correct, and the poll below
    // owns the first check -- along with its offline and non-cluster-route
    // guards, which this shortcut deliberately skips.
    if (!preparationEnded) {
      return;
    }

    let cancelled = false;
    // Failures during preparation are expected, so they should not leave the
    // poll interval inflated for the rest of the session.
    setNetworkStatusCheckTimeFactor(0);
    checkerFunction()
      .then(() => {
        if (!cancelled) {
          setError(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [suppress, pathname, checkerFunction]);

  React.useEffect(
    () => {
      let stale = false;
      const id = registerSetInterval(() => stale);
      return () => {
        stale = true;
        clearInterval(id);
      };
    },
    // eslint-disable-next-line
    [networkStatusCheckTimeFactor, suppress, pathname]
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

  if (!error || !showOnRoute || dismissed || suppress) {
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
  // Re-render on navigation so the URL-derived cluster below stays current:
  // getCluster() reads the location, which Redux state changes alone don't track,
  // so without this the selector could keep a stale cluster after a route change.
  useLocation();
  // Suppress the banner while the current cluster is being prepared by pre-open
  // hooks (the connecting popup owns the UX during that window).
  const isPreparing = useTypedSelector(state => {
    const current = getCluster();
    const preparing = state.clusterProvider.preparing;
    return !!current && !!preparing && Object.prototype.hasOwnProperty.call(preparing, current);
  });
  return <PureAlertNotification checkerFunction={testClusterHealth} suppress={isPreparing} />;
}

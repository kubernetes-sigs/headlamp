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

import { InlineIcon } from '@iconify/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import _ from 'lodash';
import React, { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { generatePath, useHistory, useLocation } from 'react-router-dom';
import { getAppUrl } from '../../helpers/getAppUrl';
import { getCluster, getClusterPrefixedPath } from '../../lib/cluster';
import { useClustersConf } from '../../lib/k8s';
import { testAuth } from '../../lib/k8s/api/v1/clusterApi';
import { queryClient } from '../../lib/queryClient';
import { createRouteURL } from '../../lib/router/createRouteURL';
import { getRoute } from '../../lib/router/getRoute';
import { getRoutePath } from '../../lib/router/getRoutePath';
import { setConfig } from '../../redux/configSlice';
import { ClusterDialog } from '../cluster/Chooser';
import { DialogTitle } from '../common/Dialog';
import Empty from '../common/EmptyContent';
import Link from '../common/Link';
import Loader from '../common/Loader';
import OauthPopup from '../oidcauth/OauthPopup';

function ColorButton({ children, ...rest }: ComponentProps<typeof Button>) {
  return (
    <Button variant="contained" sx={{ width: '14rem', padding: '0.5rem 2rem' }} {...rest}>
      {children}
    </Button>
  );
}

interface ReactRouterLocationStateIface {
  from?: Location;
}

export interface AuthChooserProps {
  children?: React.ReactNode;
}

function AuthChooser({ children }: AuthChooserProps) {
  const history = useHistory();
  const location = useLocation();
  const clusters = useClustersConf();
  const dispatch = useDispatch();
  const [testingAuth, setTestingAuth] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const { from = { pathname: createRouteURL('cluster') } } = (location.state ||
    {}) as ReactRouterLocationStateIface;
  const clusterName = getCluster() as string;
  const { t } = useTranslation();
  const clustersRef = React.useRef<typeof clusters>(null);
  const cancelledRef = React.useRef(false);

  let clusterAuthType = '';
  if (clusters && clusters[clusterName]) {
    clusterAuthType = clusters[clusterName].auth_type;
  }

  const numClusters = Object.keys(clusters || {}).length;

  function runTestAuthAgain() {
    setError(null);
    clustersRef.current = null;
  }

  React.useEffect(
    () => {
      const sameClusters = _.isEqual(clustersRef.current, clusters);
      if (!sameClusters) {
        clustersRef.current = clusters;
      }
      const clusterName = getCluster();

      // Reset the testing auth state just to prevent the early return from this function
      // without actually testing auth, which would cause the auth chooser to never show up.
      setTestingAuth(false);

      if (!clusterName || !clusters || sameClusters || error || numClusters === 0) {
        return;
      }

      const cluster = clusters[clusterName];
      if (!cluster) {
        return;
      }

      // If we haven't yet figured whether we need to use a token for the current
      //   cluster, then we check here.
      // With clusterAuthType == oidc,
      //   they are presented with a choice of login or enter token.
      if (clusterAuthType !== 'oidc' && cluster.useToken === undefined) {
        let useToken = true;

        setTestingAuth(true);

        let errorObj: Error | null = null;

        console.debug('Testing auth at authchooser');

        testAuth(clusterName)
          .then(() => {
            console.debug('Not requiring token as testing auth succeeded');
            useToken = false;
          })
          .catch(err => {
            if (!cancelledRef.current) {
              console.debug(`Requiring token for ${clusterName} as testing auth failed:`, err);

              // Ideally we'd only not assign the error if it was 401 or 403 (so we let the logic
              // proceed to request a token), but let's first check whether this is all we get
              // from clusters that require a token.
              if ([408, 504, 502].includes(err.status)) {
                errorObj = err;
              }

              setTestingAuth(false);
            }
          })
          .finally(() => {
            if (!cancelledRef.current) {
              setTestingAuth(false);

              if (!!errorObj) {
                if (!_.isEqual(errorObj, error)) {
                  setError(errorObj);
                }

                return;
              } else {
                setError(null);
              }

              cluster.useToken = useToken;
              dispatch(setConfig({ clusters: { ...clusters } }));
              // If we don't require a token, then we just move to the attempted URL or root.
              if (!useToken) {
                history.replace(from);
              }

              // If we reach this point, then we know whether or not we need a token. If we don't,
              // just redirect.
              if (cluster.useToken === false) {
                history.replace(from);
              } else if (!clusterAuthType) {
                // we know that it requires token and also doesn't have oidc configured
                // so let's redirect to token page
                history.replace({
                  pathname: generatePath(getClusterPrefixedPath('token'), {
                    cluster: clusterName as string,
                  }),
                });
              }
            }
          });
      } else if (cluster.useToken) {
        history.replace({
          pathname: generatePath(getClusterPrefixedPath('token'), {
            cluster: clusterName as string,
          }),
        });
      }
    },
    // eslint-disable-next-line
    [clusters, error]
  );

  // Ensure we have a way to know in the testAuth result whether this component is no longer
  // mounted.
  React.useEffect(() => {
    return function cleanup() {
      cancelledRef.current = true;
    };
  }, []);

  return (
    <PureAuthChooser
      clusterName={clusterName}
      testingTitle={
        numClusters > 1
          ? t('Getting auth info: {{ clusterName }}', { clusterName })
          : t('Getting auth info')
      }
      testingAuth={testingAuth}
      title={
        numClusters > 1
          ? t('Authentication: {{ clusterName }}', { clusterName })
          : t('Authentication')
      }
      error={error}
      oauthUrl={`${getAppUrl()}oidc?dt=${Date()}&cluster=${getCluster()}`}
      clusterAuthType={clusterAuthType}
      handleTryAgain={runTestAuthAgain}
      handleOidcAuth={() => {
        queryClient.invalidateQueries({ queryKey: ['clusterMe', clusterName], exact: true });
        history.replace({
          pathname: generatePath(getClusterPrefixedPath(), {
            cluster: clusterName as string,
          }),
        });
      }}
      handleBackButtonPress={() => {
        numClusters > 1 ? history.goBack() : history.push('/');
      }}
      handleTokenAuth={() => {
        const tokenRoute = getRoute('token');
        if (!tokenRoute) {
          console.error("Can't find 'token' route");
          return;
        }
        history.push({
          pathname: generatePath(getRoutePath(tokenRoute), {
            cluster: clusterName as string,
          }),
        });
      }}
    >
      {children}
    </PureAuthChooser>
  );
}

export interface PureAuthChooserProps {
  title: string;
  testingTitle: string;
  testingAuth: boolean;
  error: Error | null;
  oauthUrl: string;
  clusterAuthType: string;
  handleOidcAuth: () => void;
  handleTokenAuth: () => void;
  handleTryAgain: () => void;
  handleBackButtonPress: () => void;
  children?: React.ReactNode;
  clusterName: string;
}

export function PureAuthChooser({
  title,
  testingTitle,
  testingAuth,
  error,
  oauthUrl,
  clusterAuthType,
  handleOidcAuth,
  handleTokenAuth,
  handleTryAgain,
  handleBackButtonPress,
  children,
  clusterName,
}: PureAuthChooserProps) {
  const { t } = useTranslation();

  function onClose() {
    // Do nothing because we're not supposed to close on backdrop click or escape.
  }

  return (
    <ClusterDialog useCover onClose={onClose} aria-labelledby="authchooser-dialog-title">
      {testingAuth ? (
        <Box component="main" textAlign="center">
          <DialogTitle id="authchooser-dialog-title" focusTitle>
            {testingTitle}
          </DialogTitle>
          <Loader title={t('Testing auth')} />
        </Box>
      ) : (
        <Box component="main" display="flex" flexDirection="column" alignItems="center">
          <DialogTitle id="authchooser-dialog-title" focusTitle>
            {title}
          </DialogTitle>
          {!error ? (
            <Box>
              {clusterAuthType === 'oidc' ? (
                <Box m={2}>
                  <OauthPopup
                    onCode={handleOidcAuth}
                    url={oauthUrl}
                    title={t('Headlamp Cluster Authentication')}
                    button={ColorButton as typeof Button}
                  >
                    {t('Sign In') as string}
                  </OauthPopup>
                </Box>
              ) : null}
              <Box m={2}>
                <ColorButton onClick={handleTokenAuth}>{t('Use A Token')}</ColorButton>
              </Box>
              <Box m={2} textAlign="center">
                <Link routeName="settingsClusterHomeContext" search={{ c: clusterName }}>
                  {t('translation|Cluster settings')}
                </Link>
              </Box>
            </Box>
          ) : (
            <Box alignItems="center" textAlign="center">
              <Box m={2}>
                <Empty>
                  {error && error.message === 'Bad Gateway'
                    ? t(
                        'Failed to connect. Please make sure the Kubernetes cluster is running and accessible. Error: {{ errorMessage }}',
                        { errorMessage: error!.message }
                      )
                    : t('Failed to get authentication information: {{ errorMessage }}', {
                        errorMessage: error!.message,
                      })}
                </Empty>
                <Link routeName="settingsClusterHomeContext" search={{ c: clusterName }}>
                  {t('translation|Cluster settings')}
                </Link>
              </Box>
              <Button variant="contained" color="primary" onClick={handleTryAgain}>
                {t('translation|Try Again')}
              </Button>
            </Box>
          )}
        </Box>
      )}
      <Box display="flex" flexDirection="column" alignItems="center">
        <Box
          m={2}
          display="flex"
          alignItems="center"
          style={{ cursor: 'pointer' }}
          onClick={handleBackButtonPress}
          role="button"
        >
          <Box pt={0.5}>
            <InlineIcon icon="mdi:chevron-left" height={20} width={20} />
          </Box>
          <Box fontSize={14} style={{ textTransform: 'uppercase' }}>
            {t('translation|Back')}
          </Box>
        </Box>
      </Box>
      {children}
    </ClusterDialog>
  );
}

export default AuthChooser;

import { InlineIcon } from '@iconify/react';
import { Box, Button } from '@mui/material';
import { styled } from '@mui/system';
import _ from 'lodash';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { generatePath, useHistory, useLocation } from 'react-router-dom';
import helpers from '../../helpers';
import { useClustersConf } from '../../lib/k8s';
import { testAuth } from '../../lib/k8s/apiProxy';
import { createRouteURL, getRoute, getRoutePath } from '../../lib/router';
import { getCluster, getClusterPrefixedPath } from '../../lib/util';
import { setConfig } from '../../redux/configSlice';
import { ClusterDialog } from '../cluster/Chooser';
import { Link, Loader } from '../common';
import { DialogTitle } from '../common/Dialog';
import Empty from '../common/EmptyContent';
import OauthPopup from '../oidcauth/OauthPopup';

const ColorButton = styled(Button)(({ theme }) => ({
  color: theme.palette.primary.contrastText,
  backgroundColor: theme.palette.primaryColor,
  width: '14rem',
  padding: '0.5rem 2rem',
  '&:hover': {
    opacity: '0.8',
    backgroundColor: theme.palette.text.primary,
  },
}));

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
      oauthUrl={`${helpers.getAppUrl()}oidc?dt=${Date()}&cluster=${getCluster()}`}
      clusterAuthType={clusterAuthType}
      handleTryAgain={runTestAuthAgain}
      handleOidcAuth={() => {
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
        history.push({
          pathname: generatePath(getRoutePath(getRoute('token')), {
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
                <Link routeName="settingsCluster" params={{ clusterID: clusterName }}>
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
                <Link routeName="settingsClusterHomeContext">
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

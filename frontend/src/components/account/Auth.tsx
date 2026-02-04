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

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import Link from '@mui/material/Link';
import Snackbar, { SnackbarCloseReason } from '@mui/material/Snackbar';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { generatePath, useHistory, useLocation } from 'react-router-dom';
import { setToken } from '../../lib/auth';
import { getCluster, getClusterPrefixedPath } from '../../lib/cluster';
import { useClustersConf } from '../../lib/k8s';
import { testAuth } from '../../lib/k8s/api/v1/clusterApi';
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
import { ClusterDialog } from '../cluster/Chooser';
import { DialogTitle } from '../common/Dialog';
import HeadlampLink from '../common/Link';

export default function AuthToken() {
  const history = useHistory();
  const location = useLocation<{ from?: Location }>();
  const clusterConf = useClustersConf();
  const [token, setToken] = React.useState('');
  const [showError, setShowError] = React.useState(false);
  const clusters = useClustersConf();
  const { t } = useTranslation();

  function onAuthClicked() {
    loginWithToken(token).then(code => {
      // If successful, redirect.
      if (code === 200) {
        if (location.state && location.state.from) {
          history.replace(location.state.from);
        } else {
          history.replace(
            generatePath(getClusterPrefixedPath(), {
              cluster: getCluster() as string,
            })
          );
        }
      } else {
        setToken('');
        setShowError(true);
      }
    });
  }

  return (
    <PureAuthToken
      onCancel={() => history.replace('/')}
      title={
        Object.keys(clusterConf || {}).length > 1
          ? t('Authentication: {{ clusterName }}', { clusterName: getCluster() })
          : t('Authentication')
      }
      token={token}
      showError={showError}
      showActions={Object.keys(clusters || {}).length > 1}
      onChangeToken={(event: React.ChangeEvent<HTMLInputElement>) => setToken(event.target.value)}
      onAuthClicked={onAuthClicked}
      onCloseError={() => {
        setShowError(false);
      }}
    />
  );
}

interface clickCallbackType {
  (event: React.MouseEvent<HTMLElement>): void;
}
interface changeCallbackType {
  (event: React.ChangeEvent<HTMLInputElement>): void;
}

export interface PureAuthTokenProps {
  title: string;
  token: string;
  showActions: boolean;
  showError: boolean;
  onCancel: clickCallbackType;
  onChangeToken: changeCallbackType;
  onAuthClicked: clickCallbackType;
  onCloseError: (
    event: Event | React.SyntheticEvent<any, Event>,
    reason: SnackbarCloseReason
  ) => void;
}

export function PureAuthToken({
  title,
  token,
  showActions,
  showError,
  onCancel,
  onAuthClicked,
  onChangeToken,
  onCloseError,
}: PureAuthTokenProps) {
  const { t } = useTranslation();
  const cluster = getCluster();
  const focusedRef = React.useCallback((node: HTMLDivElement) => {
    if (node !== null) {
      // node.setAttribute('tabindex', '-1');
      node.focus();
    }
  }, []);

  function onClose() {
    // Do nothing because we're not supposed to close on backdrop click
  }

  return (
    <Box component="main">
      <ClusterDialog useCover onClose={onClose} aria-labelledby="authtoken-dialog-title">
        <DialogTitle id="authtoken-dialog-title">{title}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <Trans t={t}>Please paste your authentication token.</Trans>
          </DialogContentText>
          <TextField
            margin="dense"
            id="token"
            label={t('ID token')}
            type="password"
            size="small"
            variant="outlined"
            value={token}
            onChange={onChangeToken}
            fullWidth
            ref={focusedRef}
          />
        </DialogContent>
        <DialogActions>
          <Box ml={2}>
            <Typography variant="body2" color="textSecondary">
              <Trans t={t}>
                Check out how to generate a
                <Link
                  style={{ cursor: 'pointer', marginLeft: '0.4rem' }}
                  target="_blank"
                  href="https://headlamp.dev/docs/latest/installation/#create-a-service-account-token"
                >
                  service account token
                </Link>
                .
              </Trans>
            </Typography>
          </Box>
          <div style={{ flex: '1 0 0' }}></div>
        </DialogActions>
        <Box overflow="hidden" textAlign="center">
          <HeadlampLink routeName="settingsCluster" params={{ clusterID: cluster || '' }}>
            {t('translation|Cluster settings')}
          </HeadlampLink>
        </Box>
        <DialogActions>
          {showActions && (
            <>
              <Button onClick={onCancel} color="secondary" variant="contained">
                {t('translation|Cancel')}
              </Button>
              <div style={{ flex: '1 0 0' }} />
            </>
          )}
          <Button onClick={onAuthClicked} color="primary" variant="contained">
            {t('translation|Authenticate')}
          </Button>
        </DialogActions>
      </ClusterDialog>
      <Snackbar
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'center',
        }}
        open={showError}
        autoHideDuration={5000}
        onClose={onCloseError}
        ContentProps={{
          'aria-describedby': 'message-id',
        }}
        message={<span id="message-id">{t('translation|Error authenticating')}</span>}
      />
    </Box>
  );
}

async function loginWithToken(token: string) {
  try {
    const cluster = getCluster();
    if (!cluster) {
      // Expectation failed.
      return 417;
    }

    await setToken(cluster, token);
    await testAuth();

    return 200;
  } catch (err) {
    console.error(err);
    return (err as ApiError).status;
  }
}

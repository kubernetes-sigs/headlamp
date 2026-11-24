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
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import Typography from '@mui/material/Typography';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { useCluster } from '../../lib/k8s';
import {
  beginClusterConnectionPreparation,
  releaseClusterConnectionPreparation,
  resolveClusterRequestKubeconfig,
} from '../../lib/preparedClusterConnection';
import { createRouteURL } from '../../lib/router/createRouteURL';
import ErrorComponent from '../common/ErrorPage';
import ClusterPreparingDialog from './ClusterPreparingDialog';
import { useClusterPreOpen } from './useClusterPreOpen';

/** Props for the cluster pre-open boundary. */
export interface ClusterPreOpenGateProps {
  /** Cluster-dependent UI that mounts only after preparation succeeds. */
  children: ReactNode;
}

/**
 * Gates cluster-dependent requests and views on registered pre-open hooks.
 *
 * @param props - Cluster-dependent children.
 * @returns Preparation, error, or prepared cluster content.
 */
export default function ClusterPreOpenGate({ children }: ClusterPreOpenGateProps) {
  const cluster = useCluster();
  const preOpen = useClusterPreOpen();
  const ready = !preOpen.enabled || preOpen.isSuccess;
  const [preparedCluster, setPreparedCluster] = useState<string | null | undefined>(undefined);
  const pinPreparedConnection = !ready && preparedCluster === cluster && !!cluster;

  if (pinPreparedConnection) {
    beginClusterConnectionPreparation(cluster);
  }

  useEffect(() => {
    if (!pinPreparedConnection) return;
    return () => releaseClusterConnectionPreparation(cluster);
  }, [cluster, pinPreparedConnection]);

  useEffect(() => {
    if (ready && cluster) {
      void resolveClusterRequestKubeconfig(cluster).catch(() => {});
    }
  }, [cluster, ready]);

  if (ready && preparedCluster !== cluster) {
    setPreparedCluster(cluster);
  }

  if (!ready && preparedCluster !== cluster) {
    return <ClusterPreOpenStatus cluster={cluster!} preOpen={preOpen} />;
  }

  return (
    <>
      {children}
      {!ready && <ClusterPreOpenOverlay cluster={cluster!} preOpen={preOpen} />}
    </>
  );
}

interface ClusterPreOpenStatusProps {
  cluster: string;
  preOpen: ReturnType<typeof useClusterPreOpen>;
}

/** App-owned pending/error actions, shared by cold opens and prepared navigation. */
export function ClusterPreOpenStatus({ cluster, preOpen }: ClusterPreOpenStatusProps) {
  const { t } = useTranslation();
  const retryButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (preOpen.isError) {
      retryButtonRef.current?.focus();
    }
  }, [preOpen.isError]);

  if (preOpen.isError) {
    const detail = preOpen.error instanceof Error ? preOpen.error.message : String(preOpen.error);
    return (
      <ErrorComponent
        withTypography={false}
        title={
          <Typography variant="h4" component="h1">
            {t('translation|Could not open cluster')}
          </Typography>
        }
        error={preOpen.error instanceof Error ? preOpen.error : undefined}
        message={
          <>
            <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {detail}
            </Typography>
            <Box mt={2} display="flex" gap={2} justifyContent="center">
              <Button
                ref={retryButtonRef}
                variant="contained"
                color="primary"
                onClick={() => preOpen.retry()}
              >
                {t('translation|Retry')}
              </Button>
              <Button
                component={RouterLink}
                role={undefined}
                to={{
                  pathname: createRouteURL('chooser') || '/',
                  state: { showClusterChooser: true },
                }}
              >
                {t('translation|Back to clusters')}
              </Button>
            </Box>
          </>
        }
      />
    );
  }

  return <ClusterPreparingDialog cluster={cluster} message={preOpen.message} />;
}

/** Overlays preparation status without unmounting an already prepared view. */
export function ClusterPreOpenOverlay(props: ClusterPreOpenStatusProps) {
  const { t } = useTranslation();
  if (!props.preOpen.isError) {
    return <ClusterPreOpenStatus {...props} />;
  }
  return (
    <Dialog
      open
      maxWidth="sm"
      fullWidth
      PaperProps={{ 'aria-label': t('translation|Could not open cluster') }}
    >
      <DialogContent>
        <ClusterPreOpenStatus {...props} />
      </DialogContent>
    </Dialog>
  );
}

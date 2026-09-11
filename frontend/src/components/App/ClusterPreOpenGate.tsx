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
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useCluster } from '../../lib/k8s';
import AlertNotification from '../common/AlertNotification';
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
  const { t } = useTranslation();
  const cluster = useCluster();
  const preOpen = useClusterPreOpen();

  if (!preOpen.enabled || preOpen.isSuccess) {
    return (
      <>
        <AlertNotification />
        {children}
      </>
    );
  }

  if (preOpen.isError) {
    const detail = preOpen.error instanceof Error ? preOpen.error.message : String(preOpen.error);
    return (
      <ErrorComponent
        title={t('translation|Could not open cluster')}
        error={preOpen.error instanceof Error ? preOpen.error : undefined}
        message={
          <>
            {detail}
            <Box mt={2}>
              <Button variant="contained" color="primary" onClick={() => preOpen.retry()}>
                {t('translation|Retry')}
              </Button>
            </Box>
          </>
        }
      />
    );
  }

  return <ClusterPreparingDialog cluster={cluster!} message={preOpen.message} />;
}

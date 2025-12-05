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

import { Box, Button, ButtonProps } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Cluster } from '../../lib/k8s/cluster';
import { initiateGCPLogin, isGCPOAuthEnabled, isGKECluster } from '../../lib/k8s/gke';

export interface GCPLoginButtonProps {
  /** The cluster to authenticate to */
  cluster: Cluster | string;
  /** Optional button variant */
  variant?: ButtonProps['variant'];
  /** Optional button color */
  color?: ButtonProps['color'];
  /** Optional button size */
  size?: ButtonProps['size'];
  /** Whether to show the button in full width */
  fullWidth?: boolean;
  /** Custom button text */
  children?: React.ReactNode;
}

/**
 * A button component that initiates Google OAuth login for GKE clusters.
 * Only renders if GCP OAuth is enabled in the backend, or if the cluster is detected as a GKE cluster.
 */
export function GCPLoginButton({
  cluster,
  variant = 'contained',
  color = 'primary',
  size = 'large',
  fullWidth = true,
  children,
}: GCPLoginButtonProps) {
  const { t } = useTranslation(['translation']);
  const [gcpOAuthEnabled, setGcpOAuthEnabled] = React.useState<boolean | null>(null);

  // Get cluster name
  const clusterName = typeof cluster === 'string' ? cluster : cluster?.name;

  // Check if GCP OAuth is enabled on component mount
  React.useEffect(() => {
    isGCPOAuthEnabled()
      .then(enabled => {
        setGcpOAuthEnabled(enabled);
      })
      .catch(error => {
        console.warn('Failed to check GCP OAuth status:', error);
        setGcpOAuthEnabled(false);
      });
  }, []);

  // Show button if GCP OAuth is enabled OR if it's a GKE cluster
  const shouldShowButton = gcpOAuthEnabled === true || isGKECluster(cluster);

  if (!shouldShowButton) {
    return null;
  }

  if (!clusterName) {
    return null;
  }

  const handleClick = () => {
    initiateGCPLogin(clusterName);
  };

  return (
    <Box m={2}>
      <Button
        variant={variant}
        color={color}
        size={size}
        fullWidth={fullWidth}
        onClick={handleClick}
        startIcon={
          <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
            <path fill="none" d="M0 0h48v48H0z" />
          </svg>
        }
      >
        {children || t('translation|Sign in with Google')}
      </Button>
    </Box>
  );
}

export default GCPLoginButton;

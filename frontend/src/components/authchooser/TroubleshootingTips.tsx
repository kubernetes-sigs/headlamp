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
import Link from '@mui/material/Link';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';

const NETWORK_ERROR_PATTERNS = [/bad gateway/i, /502/, /econnrefused/i, /failed to connect/i];

export interface TroubleshootingTipsProps {
  errorMessage: string;
  errorStatus?: number;
}

export default function TroubleshootingTips({
  errorMessage,
  errorStatus,
}: TroubleshootingTipsProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  if (errorStatus === 401 || errorStatus === 403) {
    return null;
  }

  const isNetworkError =
    (errorStatus && [408, 502, 504].includes(errorStatus)) ||
    NETWORK_ERROR_PATTERNS.some(pattern => pattern.test(errorMessage)) ||
    /unreachable/i.test(errorMessage) ||
    /request timed-out/i.test(errorMessage);

  if (!isNetworkError) {
    return null;
  }

  return (
    <Box
      mt={2}
      p={2}
      sx={{
        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f5f5f5',
        borderRadius: 1,
        textAlign: 'left',
        width: '100%',
        maxWidth: 480,
      }}
    >
      <Typography variant="subtitle2" gutterBottom>
        {t('Common fixes')}
      </Typography>

      <Typography variant="body2" color="textSecondary">
        {t('Check your cluster is running')}
      </Typography>
      <Box component="code" display="block" mb={1} fontSize="0.8rem">
        minikube status
      </Box>

      <Typography variant="body2" color="textSecondary">
        {t('Verify kubectl can connect')}
      </Typography>
      <Box component="code" display="block" mb={1} fontSize="0.8rem">
        kubectl cluster-info
      </Box>

      <Typography variant="body2" color="textSecondary">
        {t('Refresh kubeconfig if IP changed')}
      </Typography>
      <Box component="code" display="block" mb={1} fontSize="0.8rem">
        minikube update-context
      </Box>

      <Typography variant="body2">
        <Link
          href="https://headlamp.dev/docs/latest/faq/"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('View full troubleshooting guide \u2192')}
        </Link>
      </Typography>
    </Box>
  );
}

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
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

export interface ClusterPreparingDialogProps {
  /** Name of the cluster being connected to. */
  cluster: string;
  /**
   * Latest progress message reported by a pre-open hook (e.g. "Starting proxy…").
   * Falls back to a generic "Preparing cluster…" when a hook reports no message.
   */
  message?: string;
}

/**
 * Modal "connecting" popup shown while a cluster's pre-open hooks run, so opening
 * a cluster reads as a deliberate connect step rather than a bare page loader.
 *
 * Pure and prop-driven so its states are storybook-/test-able in isolation;
 * `ClusterPreOpenGate` renders it while preparation is pending.
 */
export default function ClusterPreparingDialog({ cluster, message }: ClusterPreparingDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open maxWidth="xs" fullWidth aria-labelledby="cluster-preopen-title">
      <DialogTitle id="cluster-preopen-title">
        {t('translation|Connecting to "{{cluster}}"', { cluster })}
      </DialogTitle>
      <DialogContent>
        <Box display="flex" alignItems="center" gap={2} py={1}>
          <CircularProgress size={22} aria-hidden="true" />
          {/* The message changes as hooks report progress, and the spinner is
              hidden from assistive tech, so this is the only thing that conveys
              progress. A polite live region announces each update instead of
              leaving screen-reader users with just the dialog title.
              aria-atomic so the whole message is read, not only the diff. */}
          <Typography variant="body2" role="status" aria-live="polite" aria-atomic="true">
            {message || t('translation|Preparing cluster…')}
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

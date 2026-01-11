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

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link,
  List,
  ListItem,
  ListItemText,
  Snackbar,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface PRInfo {
  number: number;
  title: string;
  author: string;
  authorAvatarUrl: string;
  headSha: string;
  headRef: string;
  commitDate: string;
  commitMessage: string;
  workflowRunId: number;
  availableArtifacts: {
    name: string;
    id: number;
    size: number;
    expired: boolean;
  }[];
}

export default function PRBuildsSettings() {
  const { t } = useTranslation(['translation']);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [prBuilds, setPRBuilds] = useState<PRInfo[]>([]);
  const [activePR, setActivePR] = useState<PRInfo | null>(null);
  const [selectedPR, setSelectedPR] = useState<PRInfo | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  useEffect(() => {
    checkEnabled();
  }, []);

  useEffect(() => {
    if (enabled) {
      loadPRBuilds();
      loadStatus();
    }
  }, [enabled]);

  async function checkEnabled() {
    if (!window.desktopApi?.prBuilds) {
      setLoading(false);
      return;
    }

    try {
      const response = await window.desktopApi.prBuilds.getEnabled();
      setEnabled(response.data || false);
    } catch (err) {
      console.error('Failed to check if PR builds are enabled:', err);
    }
    setLoading(false);
  }

  async function loadPRBuilds() {
    if (!window.desktopApi?.prBuilds) return;

    try {
      setError(null);
      const response = await window.desktopApi.prBuilds.listPRBuilds();
      if (response.success && response.data) {
        setPRBuilds(response.data);
      } else {
        setError(response.error || 'Failed to load PR builds');
      }
    } catch (err) {
      console.error('Failed to load PR builds:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadStatus() {
    if (!window.desktopApi?.prBuilds) return;

    try {
      const response = await window.desktopApi.prBuilds.getPRBuildStatus();
      if (response.success && response.data?.isActive && response.data.prInfo) {
        setActivePR(response.data.prInfo);
      }
    } catch (err) {
      console.error('Failed to load PR build status:', err);
    }
  }

  async function handleActivatePR(prInfo: PRInfo) {
    if (!window.desktopApi?.prBuilds) return;

    try {
      setError(null);
      const response = await window.desktopApi.prBuilds.activatePRBuild(prInfo);
      if (response.success) {
        setActivePR(prInfo);
        setSnackbarMessage(
          t(
            'translation|PR build activated. Please restart the application to use the development build.'
          )
        );
        setSnackbarOpen(true);
      } else {
        // Don't show error if user cancelled
        if (response.error && !response.error.includes('cancelled')) {
          setError(response.error);
        }
      }
    } catch (err) {
      console.error('Failed to activate PR build:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
    setConfirmDialogOpen(false);
    setSelectedPR(null);
  }

  async function handleClearPRBuild() {
    if (!window.desktopApi?.prBuilds) return;

    try {
      setError(null);
      const response = await window.desktopApi.prBuilds.clearPRBuild();
      if (response.success) {
        setActivePR(null);
        setSnackbarMessage(
          t('translation|PR build cleared. Application will use the default build.')
        );
        setSnackbarOpen(true);
      } else {
        // Don't show error if user cancelled
        if (response.error && !response.error.includes('cancelled')) {
          setError(response.error);
        }
      }
    } catch (err) {
      console.error('Failed to clear PR build:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  // If not in desktop app or feature not enabled, don't show anything
  if (!enabled || !window.desktopApi?.prBuilds) {
    return null;
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" gutterBottom>
        {t('translation|Development Builds from PRs')}
      </Typography>

      <Alert severity="warning" sx={{ mb: 2 }}>
        {t(
          'translation|This is an advanced feature for testing development builds. Use at your own risk. Development builds may be unstable.'
        )}
      </Alert>

      {activePR && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('translation|Currently using PR #{{prNumber}}: {{prTitle}}', {
            prNumber: activePR.number,
            prTitle: activePR.title,
          })}
          <Box sx={{ mt: 1 }}>
            <Button size="small" variant="outlined" onClick={handleClearPRBuild}>
              {t('translation|Clear PR Build')}
            </Button>
          </Box>
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ mb: 2 }}>
        <Button variant="contained" onClick={loadPRBuilds}>
          {t('translation|Refresh PR List')}
        </Button>
      </Box>

      {prBuilds.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('translation|No PR builds available at this time.')}
        </Typography>
      ) : (
        <List>
          {prBuilds.map(pr => (
            <ListItem
              key={pr.number}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                mb: 1,
              }}
            >
              <ListItemText
                primary={
                  <Box>
                    <Typography variant="subtitle1">
                      #{pr.number}: {pr.title}
                    </Typography>
                  </Box>
                }
                secondary={
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      {t('translation|Author')}: {pr.author}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('translation|Commit')}: {pr.headSha.substring(0, 7)} (
                      {new Date(pr.commitDate).toLocaleDateString()})
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('translation|Artifacts')}: {pr.availableArtifacts.length}
                    </Typography>
                    <Box sx={{ mt: 1 }}>
                      <Link
                        href={`https://github.com/kubernetes-sigs/headlamp/pull/${pr.number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ mr: 2 }}
                      >
                        {t('translation|View PR')}
                      </Link>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={activePR?.number === pr.number}
                        onClick={() => {
                          setSelectedPR(pr);
                          setConfirmDialogOpen(true);
                        }}
                      >
                        {activePR?.number === pr.number
                          ? t('translation|Active')
                          : t('translation|Use This Build')}
                      </Button>
                    </Box>
                  </Box>
                }
              />
            </ListItem>
          ))}
        </List>
      )}

      <Dialog open={confirmDialogOpen} onClose={() => setConfirmDialogOpen(false)}>
        <DialogTitle>{t('translation|Confirm PR Build Activation')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {selectedPR && (
              <>
                <Typography variant="body1" gutterBottom>
                  {t('translation|You are about to activate a development build from:')}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <strong>{t('translation|PR')}: </strong>#{selectedPR.number} - {selectedPR.title}
                </Typography>
                <Typography variant="body2">
                  <strong>{t('translation|Author')}: </strong>
                  {selectedPR.author}
                </Typography>
                <Typography variant="body2">
                  <strong>{t('translation|Commit')}: </strong>
                  {selectedPR.headSha.substring(0, 7)}
                </Typography>
                <Typography variant="body2" sx={{ mt: 2 }}>
                  {t(
                    'translation|This build has not been officially released and may be unstable. Use at your own risk.'
                  )}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {t('translation|You will need to restart the application to use this build.')}
                </Typography>
              </>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialogOpen(false)}>{t('translation|Cancel')}</Button>
          <Button
            onClick={() => selectedPR && handleActivatePR(selectedPR)}
            color="primary"
            variant="contained"
          >
            {t('translation|Activate')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
      />
    </Box>
  );
}

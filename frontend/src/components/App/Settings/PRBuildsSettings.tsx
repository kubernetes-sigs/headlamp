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

import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  LinearProgress,
  Link,
  List,
  ListItem,
  Snackbar,
  Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
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
  buildStartTime?: string;
  contributors?: string[];
  availableArtifacts: {
    name: string;
    id: number;
    size: number;
    expired: boolean;
  }[];
}

const AUTO_REFRESH_INTERVAL = 60000; // 1 minute in milliseconds
const ESTIMATED_BUILD_TIME = 15 * 60 * 1000; // 15 minutes in milliseconds

export default function PRBuildsSettings() {
  const { t } = useTranslation(['translation']);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [prBuilds, setPRBuilds] = useState<PRInfo[]>([]);
  const [activePR, setActivePR] = useState<PRInfo | null>(null);
  const [selectedPR, setSelectedPR] = useState<PRInfo | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [nextRefreshIn, setNextRefreshIn] = useState<number>(AUTO_REFRESH_INTERVAL / 1000);
  const autoRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    checkEnabled();
    return () => {
      // Cleanup timers on unmount
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (enabled) {
      loadPRBuilds();
      loadStatus();
      startAutoRefresh();
    }
    return () => {
      stopAutoRefresh();
    };
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

  function startAutoRefresh() {
    // Clear any existing timers
    stopAutoRefresh();

    // Set up auto-refresh timer
    autoRefreshTimerRef.current = setInterval(() => {
      loadPRBuilds();
    }, AUTO_REFRESH_INTERVAL);

    // Set up countdown timer (updates every second)
    setNextRefreshIn(AUTO_REFRESH_INTERVAL / 1000);
    countdownTimerRef.current = setInterval(() => {
      setNextRefreshIn(prev => {
        if (prev <= 1) {
          return AUTO_REFRESH_INTERVAL / 1000;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function stopAutoRefresh() {
    if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }

  async function loadPRBuilds() {
    if (!window.desktopApi?.prBuilds) return;

    try {
      setRefreshing(true);
      setError(null);
      const response = await window.desktopApi.prBuilds.listPRBuilds();
      if (response.success && response.data) {
        // Enrich PR data with build start times (approximate from commitDate)
        const enrichedData = response.data.map((pr: PRInfo) => ({
          ...pr,
          buildStartTime: pr.commitDate, // Use commit date as approximation
        }));
        setPRBuilds(enrichedData);
        setLastRefresh(new Date());
        setNextRefreshIn(AUTO_REFRESH_INTERVAL / 1000); // Reset countdown
      } else {
        setError(response.error || 'Failed to load PR builds');
      }
    } catch (err) {
      console.error('Failed to load PR builds:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
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

  function getBuildProgress(buildStartTime?: string): number | null {
    if (!buildStartTime) return null;
    const startTime = new Date(buildStartTime).getTime();
    const now = Date.now();
    const elapsed = now - startTime;
    const progress = Math.min((elapsed / ESTIMATED_BUILD_TIME) * 100, 100);
    return progress;
  }

  function formatTimeSince(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  function formatBuildTime(buildStartTime?: string): string {
    if (!buildStartTime) return 'Unknown';
    const startTime = new Date(buildStartTime);
    const now = new Date();
    const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const remainingMinutes = Math.max(15 - minutes, 0);

    if (remainingMinutes > 0) {
      return `~${remainingMinutes}min remaining`;
    }
    return 'Completed';
  }

  function handleManualRefresh() {
    loadPRBuilds();
    setNextRefreshIn(AUTO_REFRESH_INTERVAL / 1000); // Reset countdown
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

  const getRepoOwner = () => {
    // Try to extract from first PR or default to kubernetes-sigs
    return 'kubernetes-sigs';
  };

  const getRepoName = () => {
    // Try to extract from first PR or default to headlamp
    return 'headlamp';
  };

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

      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Button
          variant="contained"
          onClick={handleManualRefresh}
          disabled={refreshing}
          startIcon={refreshing ? <CircularProgress size={20} /> : <RefreshIcon />}
        >
          {t('translation|Refresh PR List')}
        </Button>
        {lastRefresh && (
          <Typography variant="body2" color="text.secondary">
            {t('translation|Last updated')}: {formatTimeSince(lastRefresh)} •{' '}
            {t('translation|Next update in')}: {nextRefreshIn}s
          </Typography>
        )}
      </Box>

      {refreshing && <LinearProgress sx={{ mb: 2 }} />}

      {prBuilds.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('translation|No PR builds available at this time.')}
        </Typography>
      ) : (
        <List>
          {prBuilds.map(pr => {
            const buildProgress = getBuildProgress(pr.buildStartTime);
            const repoOwner = getRepoOwner();
            const repoName = getRepoName();

            return (
              <ListItem
                key={pr.number}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  mb: 1,
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                }}
              >
                <Box sx={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Avatar
                    src={pr.authorAvatarUrl}
                    alt={pr.author}
                    sx={{ width: 48, height: 48, mt: 1 }}
                  />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" gutterBottom>
                      #{pr.number}: {pr.title}
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                      <Chip label={pr.author} size="small" variant="outlined" />
                      <Chip
                        label={`${pr.availableArtifacts.length} artifacts`}
                        size="small"
                        color="primary"
                      />
                    </Box>

                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {t('translation|Commit')}: {pr.headSha.substring(0, 7)} •{' '}
                      {new Date(pr.commitDate).toLocaleString()}
                    </Typography>

                    {buildProgress !== null && buildProgress < 100 && (
                      <Box sx={{ mt: 1, mb: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">
                            {t('translation|Estimated build progress')}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatBuildTime(pr.buildStartTime)}
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={buildProgress}
                          sx={{ height: 6, borderRadius: 3 }}
                        />
                      </Box>
                    )}

                    <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Button
                        size="small"
                        component={Link}
                        href={`https://github.com/${repoOwner}/${repoName}/pull/${pr.number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t('translation|View PR')}
                      </Button>
                      <Button
                        size="small"
                        component={Link}
                        href={`https://github.com/${repoOwner}/${repoName}/actions/runs/${pr.workflowRunId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t('translation|View Action')}
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
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
                </Box>
              </ListItem>
            );
          })}
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

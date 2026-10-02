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

import { Icon } from '@iconify/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { getRecentClusters } from '../../../helpers/recentClusters';
import { useCluster } from '../../../lib/k8s/api/v1/hooks';
import { createRouteURL } from '../../../lib/router/createRouteURL';
import { Dialog } from '../Dialog';

export const WELCOME_DISMISSED_STORAGE_KEY = 'headlamp.welcome.dismissed';

// TEST-ONLY: override that forces the welcome to show regardless of prior usage.
// Remove this and its usage during cleanup.
export const WELCOME_FORCE_SHOW_STORAGE_KEY = 'headlamp.welcome.forceShow';

/** True if this browser/profile has connected to a cluster before. */
function hasExistingHeadlampUsage(): boolean {
  return getRecentClusters().length > 0;
}

const panelSx = {
  flex: 1,
  p: 2,
  border: 1,
  borderColor: 'divider',
  borderRadius: 2,
  bgcolor: 'background.paper',
  display: 'flex',
  flexDirection: 'column',
} as const;

const actionButtonSx = {
  transition: 'transform 120ms ease, box-shadow 120ms ease, background-color 120ms ease',
  '&:hover': {
    transform: 'translateY(-1px)',
    boxShadow: 2,
    backgroundColor: 'action.hover',
  },
} as const;

function Section(props: { icon: string; title: string; children: React.ReactNode }) {
  const { icon, title, children } = props;
  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <Icon icon={icon} />
        <Typography variant="subtitle1" fontWeight={600}>
          {title}
        </Typography>
      </Stack>
      {children}
    </Box>
  );
}

export default function Welcome() {
  const { t } = useTranslation();
  const cluster = useCluster();
  const history = useHistory();
  const [open, setOpen] = React.useState(() => {
    // TEST-ONLY: force-show override wins over dismissal and usage. Remove during cleanup.
    if (localStorage.getItem(WELCOME_FORCE_SHOW_STORAGE_KEY) === 'true') {
      return true;
    }
    if (localStorage.getItem(WELCOME_DISMISSED_STORAGE_KEY) === 'true') {
      return false;
    }
    // Existing users shouldn't get a first-run welcome when this feature ships.
    if (hasExistingHeadlampUsage()) {
      localStorage.setItem(WELCOME_DISMISSED_STORAGE_KEY, 'true');
      return false;
    }
    return true;
  });
  const [dontShowAgain, setDontShowAgain] = React.useState(false);

  const persistDismiss = () => {
    localStorage.setItem(WELCOME_DISMISSED_STORAGE_KEY, 'true');
    // TEST-ONLY: clear force-show override so dismissal sticks. Remove during cleanup.
    localStorage.removeItem(WELCOME_FORCE_SHOW_STORAGE_KEY);
  };

  const handleClose = () => {
    if (dontShowAgain) {
      persistDismiss();
    }
    setOpen(false);
  };

  const goToClusters = () => {
    persistDismiss();
    setOpen(false);
    history.push(createRouteURL('chooser'));
  };

  return (
    <Dialog open={open} onClose={handleClose} title={t('Welcome to Headlamp')} maxWidth="md">
      <DialogContent dividers>
        <Stack spacing={2.5}>
          <Typography>
            {t(
              'Headlamp is an extensible Kubernetes UI for browsing workloads, networking, and more. Connect a cluster to get started.'
            )}
          </Typography>

          <Section icon="mdi:home-outline" title={t('Your home page')}>
            <Typography variant="body2" color="text.secondary">
              {t(
                'The home page lists every cluster Headlamp can connect to. Switch between them and see recent activity at a glance.'
              )}
            </Typography>
            {cluster && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t('Current cluster:')}{' '}
                <Box component="span" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                  {cluster}
                </Box>
              </Typography>
            )}
          </Section>

          <Section icon="mdi:bell-outline" title={t('Notifications')}>
            <Typography variant="body2" color="text.secondary">
              {t(
                'The Notifications tab gathers warnings and events from your clusters so you can catch problems early.'
              )}
            </Typography>
          </Section>

          <Section icon="mdi:cog-outline" title={t('Settings')}>
            <Typography variant="body2" color="text.secondary">
              {t(
                'Open Settings to adjust themes, language, cluster preferences, and plugin options.'
              )}
            </Typography>
          </Section>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="stretch">
            <Box sx={panelSx}>
              <Section icon="mdi:rocket-launch-outline" title={t('Quick start')}>
                <Typography variant="body2" color="text.secondary">
                  {t(
                    'Add a cluster to start exploring its workloads, services, and configuration.'
                  )}
                </Typography>
                <Button
                  variant="outlined"
                  size="medium"
                  sx={{ mt: 1, fontSize: '.9rem', ...actionButtonSx }}
                  startIcon={<Icon icon="mdi:server-plus" />}
                  onClick={goToClusters}
                >
                  {t('Add a cluster')}
                </Button>
              </Section>
            </Box>

            <Box sx={panelSx}>
              <Section icon="mdi:school-outline" title={t('Learn more')}>
                <Typography variant="body2" color="text.secondary">
                  {t('Browse the docs, guides, and tutorials to get the most out of Headlamp.')}
                </Typography>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  sx={{ mt: 3, alignItems: 'center' }}
                >
                  <Link
                    href="https://headlamp.dev/docs/latest/"
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="hover"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', lineHeight: 1 }}>
                      <Icon icon="mdi:open-in-new" />
                    </Box>
                    <Typography component="span" variant="body2">
                      {t('Read the docs')}
                    </Typography>
                  </Link>
                  <Link
                    href="https://headlamp.dev/docs/latest/learn"
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="hover"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', lineHeight: 1 }}>
                      <Icon icon="mdi:open-in-new" />
                    </Box>
                    <Typography component="span" variant="body2">
                      {t('Explore Learn')}
                    </Typography>
                  </Link>
                </Stack>
              </Section>
            </Box>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <FormControlLabel
          control={
            <Checkbox checked={dontShowAgain} onChange={e => setDontShowAgain(e.target.checked)} />
          }
          slotProps={{ typography: { sx: { mt: '2px' } } }}
          label={t("Don't show again")}
        />
      </DialogActions>
    </Dialog>
  );
}

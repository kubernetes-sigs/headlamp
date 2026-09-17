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
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
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

  const dismiss = () => {
    localStorage.setItem(WELCOME_DISMISSED_STORAGE_KEY, 'true');
    // TEST-ONLY: clear force-show override so dismissal sticks. Remove during cleanup.
    localStorage.removeItem(WELCOME_FORCE_SHOW_STORAGE_KEY);
    setOpen(false);
  };

  const goToClusters = () => {
    dismiss();
    history.push(createRouteURL('chooser'));
  };

  return (
    <Dialog open={open} onClose={dismiss} title={t('Welcome to Headlamp')} maxWidth="sm">
      <DialogContent dividers>
        <Stack spacing={2.5}>
          <Typography>
            {t(
              'Headlamp is an easy-to-use, extensible Kubernetes web UI. View, inspect, and manage the resources across your clusters — from workloads and networking to storage and RBAC.'
            )}
          </Typography>

          <Section icon="mdi:home-outline" title={t('Your home page')}>
            <Typography variant="body2" color="text.secondary">
              {t(
                'The home page lists every cluster Headlamp can connect to, so you can switch between them and see recent activity at a glance.'
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

          <Section icon="mdi:rocket-launch-outline" title={t('Quick start')}>
            <Typography variant="body2" color="text.secondary">
              {t(
                'Add and connect a cluster to start exploring its workloads, services, and configuration.'
              )}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              sx={{ mt: 1 }}
              startIcon={<Icon icon="mdi:server-plus" />}
              onClick={goToClusters}
            >
              {t('Add a cluster')}
            </Button>
          </Section>

          <Section icon="mdi:school-outline" title={t('Learn more')}>
            <Typography variant="body2" color="text.secondary">
              {t('Explore guides and tutorials to get the most out of Headlamp.')}
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
              <Button
                component={Link}
                href="https://headlamp.dev/docs/latest/"
                target="_blank"
                rel="noopener noreferrer"
                startIcon={<Icon icon="mdi:book-open-page-variant" />}
              >
                {t('Read the docs')}
              </Button>
              <Button
                component={Link}
                href="https://headlamp.dev/docs/latest/learn"
                target="_blank"
                rel="noopener noreferrer"
                startIcon={<Icon icon="mdi:school" />}
              >
                {t('Explore Learn')}
              </Button>
            </Stack>
          </Section>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={dismiss}>
          {t('Get started')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

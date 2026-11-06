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
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { isElectron } from '../../../helpers/isElectron';
import { getRecentClusters, setRecentCluster } from '../../../helpers/recentClusters';
import { useClustersConf } from '../../../lib/k8s';
import { useCluster } from '../../../lib/k8s/api/v1/hooks';
import { createRouteURL } from '../../../lib/router/createRouteURL';
import { setAppSettings } from '../../../redux/configSlice';
import { Dialog } from '../Dialog';
import { useGuidedTooltips } from '../TutorialInfoBox/TutorialInfoBox';

export const WELCOME_DISMISSED_STORAGE_KEY = 'headlamp.welcome.dismissed';

function persistWelcomeDismissed() {
  try {
    localStorage.setItem(WELCOME_DISMISSED_STORAGE_KEY, 'true');
  } catch (error) {
    console.warn('Failed to persist welcome dismissal:', error);
  }
}

/** Whether to show the first-run welcome. Existing users are marked as dismissed. */
function shouldShowWelcome(): boolean {
  if (localStorage.getItem(WELCOME_DISMISSED_STORAGE_KEY) === 'true') {
    return false;
  }
  // Having connected to a cluster before means this isn't a first run.
  if (getRecentClusters().length > 0) {
    persistWelcomeDismissed();
    return false;
  }
  return true;
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
        <Typography variant="subtitle1" component="h2" fontWeight={600}>
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
  const dispatch = useDispatch();
  const tutorialTooltips = useGuidedTooltips();
  const clusters = useClustersConf();
  const [open, setOpen] = React.useState(shouldShowWelcome);
  const [dontShowAgain, setDontShowAgain] = React.useState(false);

  const handleClose = () => {
    if (dontShowAgain) {
      persistWelcomeDismissed();
    }
    setOpen(false);
  };

  const goTo = (url: string) => {
    persistWelcomeDismissed();
    setOpen(false);
    history.push(url);
  };

  const clusterNames = clusters ? Object.keys(clusters) : null;
  const hasClusters = !!clusterNames && clusterNames.length > 0;

  // Only the desktop app can add clusters in-app; web deployments get clusters from the server.
  // While cluster config is still loading (null), assume clusters exist and point at them.
  let quickStart: {
    description: string;
    label?: string;
    icon?: string;
    onClick?: () => void;
    href?: string;
    /** Alternative setups to choose from, shown instead of a single action. */
    choices?: React.ReactNode;
  };
  if (isElectron()) {
    quickStart = {
      description: t(
        'Add a cluster to start exploring its workloads, services, and configuration.'
      ),
      label: t('Add a cluster'),
      icon: 'mdi:server-plus',
      onClick: () => goTo(createRouteURL('addCluster')),
    };
  } else if (clusterNames === null || hasClusters) {
    const singleCluster = clusterNames?.length === 1 ? clusterNames[0] : null;
    quickStart = {
      description: t(
        'Your clusters are ready. Open one to start exploring its workloads, services, and configuration.'
      ),
      label: singleCluster ? t('Open your cluster') : t('View your clusters'),
      icon: 'mdi:server',
      onClick: () => {
        if (singleCluster) {
          // Record it like the cluster choosers do, so Home and Notifications treat it as in use.
          setRecentCluster(singleCluster);
          goTo(createRouteURL('cluster', { cluster: singleCluster }));
        } else {
          goTo(createRouteURL('chooser'));
        }
      },
    };
  } else {
    // Web users can't add clusters in-app, so list every way to give Headlamp clusters.
    const docLink = (href: string) => ({
      1: <Link href={href} target="_blank" rel="noopener noreferrer" underline="hover" />,
    });
    quickStart = {
      description: t(
        "Headlamp doesn't have access to any clusters yet. Clusters come from how Headlamp is set up:"
      ),
      choices: (
        <Stack component="ul" spacing={0.75} sx={{ m: 0, mt: 1, pl: 2.5 }}>
          <Typography component="li" variant="body2">
            <Trans
              t={t}
              i18nKey="If you wish to view the cluster Headlamp is deployed in, use an <1>in-cluster deployment</1>."
              components={docLink(
                'https://headlamp.dev/docs/latest/installation/in-cluster/#using-helm'
              )}
            />
          </Typography>
          <Typography component="li" variant="body2">
            <Trans
              t={t}
              i18nKey="If you wish to add other clusters, use a <1>mounted kubeconfig file</1>."
              components={docLink(
                'https://headlamp.dev/docs/latest/installation/in-cluster/#use-a-non-default-kube-config-file'
              )}
            />
          </Typography>
          <Typography component="li" variant="body2">
            <Trans
              t={t}
              i18nKey="If you wish to discover clusters automatically, use the <1>Cluster Inventory API</1>."
              components={docLink(
                'https://headlamp.dev/docs/latest/installation/in-cluster/#cluster-inventory'
              )}
            />
          </Typography>
          <Typography component="li" variant="body2">
            <Trans
              t={t}
              i18nKey="If you wish to add clusters from a plugin, use <1>dynamic clusters</1>."
              components={docLink(
                'https://headlamp.dev/docs/latest/development/plugins/functionality/#dynamic-clusters'
              )}
            />
          </Typography>
          <Typography component="li" variant="body2">
            <Trans
              t={t}
              i18nKey="If you wish to use your local kubeconfig in a browser, use the desktop app's <1>headless mode</1>."
              components={docLink('https://headlamp.dev/docs/latest/installation/desktop/headless')}
            />
          </Typography>
          <Typography component="li" variant="body2">
            <Trans
              t={t}
              i18nKey="If you wish to add clusters from within Headlamp, use the <1>desktop app</1>."
              components={docLink('https://headlamp.dev/docs/latest/installation/desktop/')}
            />
          </Typography>
        </Stack>
      ),
    };
  }

  return (
    <Dialog open={open} onClose={handleClose} title={t('Welcome to Headlamp')} maxWidth="md">
      <DialogContent dividers>
        <Stack spacing={2.5}>
          <Typography>
            {hasClusters
              ? t(
                  'Headlamp is an extensible Kubernetes UI for browsing workloads, networking, and more. Pick a cluster to get started.'
                )
              : t(
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

          <Stack direction="column" spacing={2} alignItems="stretch">
            <Box sx={panelSx}>
              <Section icon="mdi:rocket-launch-outline" title={t('Quick start')}>
                <Typography variant="body2" color="text.secondary">
                  {quickStart.description}
                </Typography>
                {quickStart.choices}
                {quickStart.label && (
                  <Button
                    variant="outlined"
                    size="medium"
                    sx={{ mt: 1, fontSize: '.9rem', ...actionButtonSx }}
                    startIcon={quickStart.icon && <Icon icon={quickStart.icon} />}
                    onClick={quickStart.onClick}
                    {...(quickStart.href && {
                      href: quickStart.href,
                      target: '_blank',
                      rel: 'noopener noreferrer',
                    })}
                  >
                    {quickStart.label}
                  </Button>
                )}
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
        <Tooltip title={t('Disable helpful tooltips for navigating Headlamp')} describeChild>
          <FormControlLabel
            control={
              <Checkbox
                checked={!tutorialTooltips}
                onChange={e => dispatch(setAppSettings({ tutorialTooltips: !e.target.checked }))}
              />
            }
            slotProps={{ typography: { sx: { mt: '2px' } } }}
            label={t('Disable guided tooltips')}
          />
        </Tooltip>
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

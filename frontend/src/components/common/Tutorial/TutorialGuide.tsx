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

import { InlineIcon } from '@iconify/react';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import React from 'react';
import { getActiveTutorial, setActiveTutorial } from './tutorialStorage';

export interface TutorialGuideProps {
  open: boolean;
  onClose: () => void;
}

export default function TutorialGuide({ open, onClose }: TutorialGuideProps) {
  const [active, setActive] = React.useState(getActiveTutorial());

  React.useEffect(() => {
    const onStorage = () => setActive(getActiveTutorial());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleTopic = (topicId: typeof active.topicId) => {
    const next = active.topicId === topicId ? null : topicId;
    setActiveTutorial(next);
    setActive({ topicId: next });
  };

  const showMeVariant = (topicId: string | null) =>
    active.topicId === topicId ? 'contained' : 'outlined';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth aria-labelledby="tutorial-title">
      <DialogTitle id="tutorial-title" sx={{ pr: 6 }}>
        Headlamp Quick Start Guide
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Box
          sx={{
            mb: 2,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Box>
            <Typography variant="body1" sx={{ mb: 1 }}>
              This quick start guide helps you learn and navigate Headlamp.
            </Typography>
            <Typography variant="body1" sx={{ mb: 1 }}>
              Click on a topic to expand its question list, choose a question and follow the steps.
            </Typography>
          </Box>

          <Box>
            <Typography variant="body1" sx={{ mb: 1 }}></Typography>
            You can also click the <strong>Show Me</strong> button to highlight the relevant parts
            of the UI.
            <Typography variant="body2" color="yellow" sx={{ mb: 1 }}>
              When using "Show Me", look for the yellow outline with the lightbulb{' '}
              <LightbulbOutlinedIcon />, hovering over the highlighted areas will display additional
              information.
            </Typography>
          </Box>
        </Box>

        <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
          Topics
        </Typography>

        {/* Clusters (borderless section) */}
        <Accordion
          disableGutters
          square
          sx={{
            boxShadow: 'none',
            border: 'none',
            '&:before': { display: 'none' },
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1" fontWeight="bold">
              Clusters
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1.5}>
              {/* Q1: start a cluster (outlined question box) */}
              <Accordion
                disableGutters
                square
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    sx={{ width: '100%' }}
                  >
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      How do I start a cluster?
                    </Typography>
                    <Button
                      variant={showMeVariant('clusters.addCluster')}
                      color="warning"
                      startIcon={<LightbulbOutlinedIcon />}
                      onClick={() => toggleTopic('clusters.addCluster')}
                      aria-pressed={active.topicId === 'clusters.addCluster'}
                    >
                      Show Me
                    </Button>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Box component="ul" sx={{ pl: 3, mb: 0 }}>
                    <li>
                      At the main dashboard, click the <strong>Add Cluster</strong> button at the
                      bottom left.
                    </li>
                    <li>
                      On the <strong>Add Cluster</strong> page, choose <em>Load from Kubeconfig</em>{' '}
                      if you have a kubeconfig.
                      <br />
                      <small>
                        (Alternatively, use the quick-start cluster. You can also add a local
                        provider via <em>Add Local Cluster Provider</em>.)
                      </small>
                    </li>
                    <li>
                      After adding, open the cluster overview page to start exploring resources.
                    </li>
                  </Box>
                </AccordionDetails>
              </Accordion>

              {/* Q2: delete a cluster (outlined question box) */}
              <Accordion
                disableGutters
                square
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    sx={{ width: '100%' }}
                  >
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      How do I delete a cluster?
                    </Typography>
                    <Button
                      variant={showMeVariant('clusters.deleteCluster')}
                      color="warning"
                      startIcon={<LightbulbOutlinedIcon />}
                      onClick={() => toggleTopic('clusters.deleteCluster')}
                      aria-pressed={active.topicId === 'clusters.deleteCluster'}
                    >
                      Show Me
                    </Button>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Box component="ul" sx={{ pl: 3, mb: 0 }}>
                    <li>
                      Locate the name of the cluster you would like to remove on the home page.
                    </li>
                    <li>
                      Click the menu icon <InlineIcon icon="mdi:dots-vertical" /> for that cluster.
                    </li>
                    <li>Click the “Delete” option for that cluster.</li>
                  </Box>
                </AccordionDetails>
              </Accordion>
            </Stack>
          </AccordionDetails>
        </Accordion>

        <Divider sx={{ my: 2 }} />

        {/* Resources (borderless section) */}
        <Accordion
          disableGutters
          square
          sx={{
            boxShadow: 'none',
            border: 'none',
            '&:before': { display: 'none' },
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1" fontWeight="bold">
              Resources
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1.5}>
              {/* Q1: add a resource (outlined question box) */}
              <Accordion
                disableGutters
                square
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    sx={{ width: '100%' }}
                  >
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      How do I add a resource to my cluster?
                    </Typography>
                    <Button
                      variant={showMeVariant('resources.addResource')}
                      color="warning"
                      startIcon={<LightbulbOutlinedIcon />}
                      onClick={() => toggleTopic('resources.addResource')}
                      aria-pressed={active.topicId === 'resources.addResource'}
                    >
                      Show Me
                    </Button>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Box component="ul" sx={{ pl: 3, mb: 0 }}>
                    <li>
                      Inside the cluster view, click the <strong>Create</strong> button.
                    </li>
                    <li>
                      Follow the Pod example or paste your own YAML to create any Kubernetes
                      resource.
                    </li>
                    <li>Once created, the resource appears immediately in the dashboard.</li>
                  </Box>
                </AccordionDetails>
              </Accordion>
            </Stack>
          </AccordionDetails>
        </Accordion>
      </DialogContent>
    </Dialog>
  );
}

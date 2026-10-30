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
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useTypedSelector } from '../../../redux/hooks';
import TooltipLight from './TooltipLight';

/** Whether the "Enable guided tooltips" setting is on. */
export function useGuidedTooltips(): boolean {
  return useTypedSelector(state => state.config.settings.tutorialTooltips);
}

export interface GuidedTooltipProps {
  /** Accessible name for the info button, e.g. "About loading from KubeConfig". */
  label: string;
  /** What the related UI element does. */
  description: string;
  /** Optional "If you are using X, use this option." guidance. */
  recommendation?: string;
}

/**
 * An info button that explains nearby UI to new users.
 * Renders nothing when guided tooltips are disabled in Settings.
 */
export default function GuidedTooltip(props: GuidedTooltipProps) {
  const { label, description, recommendation } = props;
  const enabled = useGuidedTooltips();

  if (!enabled) {
    return null;
  }

  return (
    <TooltipLight
      title={
        <Box sx={{ p: 0.5, maxWidth: 320 }}>
          <Typography variant="body2">{description}</Typography>
          {recommendation && (
            <Typography variant="body2" sx={{ mt: 1, fontWeight: 600 }}>
              {recommendation}
            </Typography>
          )}
        </Box>
      }
    >
      <IconButton size="small" aria-label={label} sx={{ ml: 0.5 }}>
        <InlineIcon icon="mdi:information-outline" />
      </IconButton>
    </TooltipLight>
  );
}

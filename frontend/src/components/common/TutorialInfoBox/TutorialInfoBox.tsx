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
import Box, { BoxProps } from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useTypedSelector } from '../../../redux/hooks';

// Each set meets WCAG AA for text (4.5:1) and accent vs. box/page (3:1).
const darkColors = { background: '#6b5200', text: '#fff8e1', accent: '#ffd54f' };
const lightColors = { background: '#fff4cc', text: '#3d2e00', accent: '#a67c00' };

/** Whether the "Enable guided tooltips" setting is on. */
export function useGuidedTooltips(): boolean {
  return useTypedSelector(state => state.config.settings.tutorialTooltips);
}

export interface TutorialInfoBoxProps {
  /** Accessible name for the box, e.g. "About loading from KubeConfig". */
  label: string;
  /** What the related UI element does. */
  description: string;
  /** Optional "If you are using X, use this option." guidance. */
  recommendation?: string;
  sx?: BoxProps['sx'];
}

/**
 * A highlighted box that explains nearby UI to new users.
 * Renders nothing when guided tooltips are disabled in Settings.
 */
export default function TutorialInfoBox(props: TutorialInfoBoxProps) {
  const { label, description, recommendation, sx } = props;
  const theme = useTheme();
  const enabled = useGuidedTooltips();

  if (!enabled) {
    return null;
  }

  const colors = theme.palette.mode === 'dark' ? darkColors : lightColors;

  return (
    <Box
      role="note"
      aria-label={label}
      sx={[
        {
          display: 'flex',
          width: 'fit-content',
          alignItems: 'flex-start',
          gap: 2,
          p: 2,
          borderRadius: 1,
          border: `1px solid ${colors.accent}`,
          bgcolor: colors.background,
          color: colors.text,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box component="span" aria-hidden sx={{ display: 'flex', color: colors.accent }}>
        <Icon icon="mdi:lightbulb-on-outline" width={24} height={24} />
      </Box>
      <Box sx={{ flex: 1 }}>
        <Typography variant="body2">{description}</Typography>
        {recommendation && (
          <Typography variant="body2" sx={{ mt: 1, fontWeight: 600 }}>
            {recommendation}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

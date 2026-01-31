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
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Represents a parsed a8r.io annotation item with display metadata.
 */
export type A8RMetadataItem = {
  /** The annotation key without the 'a8r.io/' prefix (e.g., 'owner', 'description') */
  key: string;
  /** Translation key for the display label */
  labelKey: string;
  /** The annotation value */
  value: string;
  /** MDI icon identifier for visual display */
  icon: string;
  /** Whether the value is a valid HTTP/HTTPS URL */
  isLink: boolean;
};

const A8R_ICON_MAP: Record<string, { icon: string; labelKey: string }> = {
  description: { icon: 'mdi:information-outline', labelKey: 'Description' },
  owner: { icon: 'mdi:account', labelKey: 'Owner' },
  dependencies: { icon: 'mdi:sitemap', labelKey: 'Dependencies' },
  chat: { icon: 'mdi:chat', labelKey: 'Chat' },
  bugs: { icon: 'mdi:bug', labelKey: 'Bugs' },
  logs: { icon: 'mdi:chart-timeline-variant', labelKey: 'Logs' },
  documentation: { icon: 'mdi:book-open-page-variant', labelKey: 'Documentation' },
  repository: { icon: 'mdi:github', labelKey: 'Repository' },
  support: { icon: 'mdi:help-circle', labelKey: 'Support' },
  runbook: { icon: 'mdi:script-text', labelKey: 'Runbook' },
  incidents: { icon: 'mdi:alert-circle', labelKey: 'Incidents' },
  uptime: { icon: 'mdi:check-circle', labelKey: 'Uptime' },
  performance: { icon: 'mdi:speedometer', labelKey: 'Performance' },
};

const PREFERRED_ORDER = [
  'description',
  'owner',
  'dependencies',
  'chat',
  'documentation',
  'repository',
  'logs',
  'bugs',
  'support',
  'runbook',
  'incidents',
  'uptime',
  'performance',
];

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Parses Kubernetes service annotations and extracts a8r.io metadata items.
 *
 * Filters annotations starting with 'a8r.io/', maps them to display-friendly
 * metadata items with icons and labels, and sorts by preferred display order.
 *
 * @param annotations - Key-value pairs of Kubernetes annotations (defaults to empty object)
 * @returns Array of parsed metadata items sorted by preferred display order
 */
export function getA8RMetadata(annotations: Record<string, string> = {}): A8RMetadataItem[] {
  return Object.entries(annotations)
    .filter(([key]) => key.startsWith('a8r.io/'))
    .map(([key, value]) => {
      const shortKey = key.replace('a8r.io/', '');
      const meta = A8R_ICON_MAP[shortKey];
      if (!meta) return null;

      return {
        key: shortKey,
        labelKey: meta.labelKey,
        value,
        icon: meta.icon,
        isLink: isValidHttpUrl(value),
      };
    })
    .filter((v): v is A8RMetadataItem => Boolean(v))
    .sort((a, b) => {
      const ai = PREFERRED_ORDER.indexOf(a.key);
      const bi = PREFERRED_ORDER.indexOf(b.key);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
}

export default function A8RServiceInfo({ annotations }: { annotations?: Record<string, string> }) {
  const { t } = useTranslation();

  const metadata = React.useMemo(() => getA8RMetadata(annotations), [annotations]);

  if (metadata.length === 0) return null;

  return (
    <Box display="flex" flexDirection="column" gap={1.5}>
      {metadata.map(item => (
        <Box key={item.key} display="flex" alignItems="center">
          <Icon icon={item.icon} width="20" style={{ marginRight: 8 }} />
          <Typography variant="body2">
            <strong>{t(item.labelKey)}:</strong>{' '}
            {item.isLink ? (
              <Link href={item.value} target="_blank" rel="noopener noreferrer">
                {item.value}
              </Link>
            ) : (
              item.value
            )}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

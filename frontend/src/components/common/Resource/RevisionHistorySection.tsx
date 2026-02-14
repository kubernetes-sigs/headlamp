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
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import type { RevisionInfo } from '../../../lib/k8s/rollback';
import { DateLabel } from '../Label';
import SectionBox from '../SectionBox';

interface RevisionHistorySectionProps {
  /** The resource to show revision history for */
  resource: KubeObject;
}

/**
 * Helper to extract revision history from a resource that supports it.
 */
function getRevisionHistoryFn(resource: KubeObject): (() => Promise<RevisionInfo[]>) | undefined {
  if ('getRevisionHistory' in resource && typeof resource.getRevisionHistory === 'function') {
    return () => (resource as any).getRevisionHistory();
  }
  return undefined;
}

/**
 * RevisionHistorySection shows a table of revision history for rollbackable resources.
 * Displays revision number, creation date, container images, and current status.
 *
 * This is added as an extraSection on Deployment, DaemonSet, and StatefulSet details pages.
 */
export default function RevisionHistorySection(props: RevisionHistorySectionProps) {
  const { resource } = props;
  const { t } = useTranslation(['translation']);

  const [revisions, setRevisions] = useState<RevisionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getHistory = getRevisionHistoryFn(resource);

  useEffect(() => {
    const historyGetter = getRevisionHistoryFn(resource);
    let isActive = true;

    if (!historyGetter) {
      setRevisions([]);
      setError(null);
      setLoading(false);
      return () => {
        isActive = false;
      };
    }

    setLoading(true);
    setError(null);
    historyGetter()
      .then(history => {
        if (!isActive) {
          return;
        }
        setRevisions(history);
        setLoading(false);
      })
      .catch(err => {
        if (!isActive) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [resource?.metadata?.uid, resource?.metadata?.resourceVersion]);

  if (!getHistory) {
    return null;
  }

  return (
    <SectionBox title={t('translation|Revision History')}>
      {loading && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          {t('translation|Loading revision history…')}
        </Typography>
      )}
      {error && (
        <Typography variant="body2" color="error" sx={{ py: 2 }}>
          {t('translation|Failed to load revision history: {{ error }}', { error })}
        </Typography>
      )}
      {!loading && !error && revisions.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          {t('translation|No revision history available.')}
        </Typography>
      )}
      {!loading && !error && revisions.length > 0 && (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('translation|Revision')}</TableCell>
                <TableCell>{t('translation|Created')}</TableCell>
                <TableCell>{t('translation|Images')}</TableCell>
                <TableCell>{t('translation|Status')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {revisions.map(rev => (
                <TableRow key={rev.revision}>
                  <TableCell>
                    <Typography variant="body2">{rev.revision}</Typography>
                  </TableCell>
                  <TableCell>
                    <DateLabel date={rev.createdAt} />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      {rev.images.map((img, i) => (
                        <Typography key={i} variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {img}
                        </Typography>
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {rev.isCurrent ? (
                      <Chip
                        label={t('translation|Current')}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {t('translation|Previous')}
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </SectionBox>
  );
}

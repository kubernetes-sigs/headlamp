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

import { Box, Chip, CircularProgress, Typography } from '@mui/material';
import { Trans, useTranslation } from 'react-i18next';
import { StringSelector } from '../../redux/projectsSlice';
import { ClusterGroupErrorMessage } from '../cluster/ClusterGroupErrorMessage';
import { useLabelSuggestions } from './useLabelSuggestions';

interface ProjectSuggestionsProps {
  clusters: string[];
  namespaces?: string[];
  onSuggestionClick: (labelSelector: { [key: string]: StringSelector }) => void;
}

export function ProjectSuggestions({
  clusters,
  namespaces,
  onSuggestionClick,
}: ProjectSuggestionsProps) {
  const { t } = useTranslation();
  const { suggestions, isLoading, errors } = useLabelSuggestions({
    clusters,
    namespaces,
  });

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100px">
        <CircularProgress />
        <Typography variant="h6" sx={{ ml: 2 }}>
          {t('Detecting applications...')}
        </Typography>
      </Box>
    );
  }

  if (errors.length > 0) {
    return (
      <Typography color="error">
        {t('Error detecting applications.')}
        <ClusterGroupErrorMessage errors={errors} />
      </Typography>
    );
  }

  if (clusters.length === 0) {
    return (
      <Box
        sx={theme => ({
          background: theme.palette.background.muted,
          borderRadius: theme.shape.borderRadius + 'px',
          p: 2,
          height: '100%',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        })}
      >
        <Typography color="text.secondary">
          <Trans>Please select cluster(s) to see label suggestions.</Trans>
        </Typography>
      </Box>
    );
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <>
      <Typography variant="body2" color="text.secondary" paragraph sx={{ mt: 2 }}>
        {t('We have detected the following applications in your cluster')}
      </Typography>
      <Box display="flex" flexWrap="wrap" gap={1} sx={{ maxWidth: '500px' }}>
        {suggestions.map(s => (
          <Chip
            key={s.label + s.value}
            label={`${s.label} = ${s.value}`}
            onClick={() => onSuggestionClick({ [s.label]: { operator: 'Equals', value: s.value } })}
            clickable
            variant="outlined"
          />
        ))}
      </Box>
    </>
  );
}

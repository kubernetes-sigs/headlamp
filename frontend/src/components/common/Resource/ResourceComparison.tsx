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
import { DiffEditor } from '@monaco-editor/react';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import { useTheme } from '@mui/material/styles';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import * as yaml from 'js-yaml';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KubeObjectInterface } from '../../../lib/k8s/KubeObject';
import { countAllDifferences, stripServerFields } from './lastAppliedConfiguration';

export interface ResourceComparisonProps {
  /** The object shown on the left. */
  original: KubeObjectInterface;
  /** The object shown on the right. */
  modified: KubeObjectInterface;
  /** Describes the original object, e.g. its cluster, namespace and name. */
  originalLabel: string;
  /** Describes the modified object, e.g. its cluster, namespace and name. */
  modifiedLabel: string;
}

/**
 * Shows a read-only side-by-side diff of two objects, e.g. the same Deployment in two clusters.
 *
 * Fields populated by the API server (status, managedFields, resourceVersion, uid, etc.) differ
 * between any two objects, so they are left out unless the user asks to see them. Keys are sorted
 * so a different field order between two API servers is not shown as a change.
 */
export default function ResourceComparison({
  original,
  modified,
  originalLabel,
  modifiedLabel,
}: ResourceComparisonProps) {
  const { t } = useTranslation(['translation']);
  const theme = useTheme();
  const [showServerFields, setShowServerFields] = useState(false);

  const compared = useMemo(() => {
    const left = showServerFields ? original : stripServerFields(original);
    const right = showServerFields ? modified : stripServerFields(modified);
    const dump = (obj: unknown) => yaml.dump(obj, { sortKeys: true });
    return {
      original: dump(left),
      modified: dump(right),
      differences: countAllDifferences(left, right),
    };
  }, [original, modified, showServerFields]);

  const identical = compared.differences === 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '400px' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1,
          py: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
          <Icon
            icon={identical ? 'mdi:check-circle' : 'mdi:alert-circle'}
            width="1.2rem"
            height="1.2rem"
            color={identical ? theme.palette.success.main : theme.palette.warning.main}
            aria-hidden
          />
          <Typography>
            {identical
              ? t('translation|The objects are identical')
              : t('translation|{{count}} fields differ', { count: compared.differences })}
          </Typography>
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={showServerFields}
              onChange={() => setShowServerFields(prev => !prev)}
              name="showServerFields"
            />
          }
          label={t('translation|Show server-populated fields')}
        />
      </Box>
      <Box sx={{ display: 'flex', py: 1, gap: 1 }}>
        <Typography variant="body2" sx={{ flex: 1, overflowWrap: 'anywhere' }}>
          {originalLabel}
        </Typography>
        <Typography variant="body2" sx={{ flex: 1, overflowWrap: 'anywhere' }}>
          {modifiedLabel}
        </Typography>
      </Box>
      <Box sx={{ flexGrow: 1, minHeight: '300px' }}>
        <DiffEditor
          original={compared.original}
          modified={compared.modified}
          language="yaml"
          theme={theme.palette.mode === 'dark' ? 'vs-dark' : 'light'}
          height="100%"
          options={{
            automaticLayout: true,
            readOnly: true,
            renderSideBySide: true,
            // Keep both columns in a narrow panel, to match the labels above.
            useInlineViewWhenSpaceIsLimited: false,
          }}
        />
      </Box>
    </Box>
  );
}

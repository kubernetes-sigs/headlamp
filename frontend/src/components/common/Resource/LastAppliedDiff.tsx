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
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import { useTheme } from '@mui/material/styles';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import * as yaml from 'js-yaml';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KubeObjectInterface } from '../../../lib/k8s/KubeObject';
import { SectionBox } from '../SectionBox';
import {
  countDifferences,
  omitNullFields,
  parseLastAppliedConfiguration,
  projectOntoApplied,
  stripServerFields,
} from './lastAppliedConfiguration';

export interface LastAppliedDiffProps {
  /** The live object, as returned by the API server. */
  item: KubeObjectInterface;
}

/**
 * Shows a read-only diff between the manifest stored in the
 * kubectl.kubernetes.io/last-applied-configuration annotation and the live object.
 *
 * Renders nothing if the object has no (valid) last-applied-configuration annotation.
 */
export default function LastAppliedDiff({ item }: LastAppliedDiffProps) {
  const { t } = useTranslation(['translation']);
  const theme = useTheme();
  const [showDiff, setShowDiff] = useState(false);
  const [onlyAppliedFields, setOnlyAppliedFields] = useState(true);

  const compared = useMemo(() => {
    const lastApplied = parseLastAppliedConfiguration(item);
    if (!lastApplied) {
      return null;
    }
    const live = stripServerFields(item);
    const applied = omitNullFields(stripServerFields(lastApplied), live);
    return { applied, live, differences: countDifferences(applied, live) };
  }, [item]);

  // Only build the YAML while the diff is shown, as the object is updated often.
  const diffTexts = useMemo(() => {
    if (!compared || !showDiff) {
      return null;
    }
    const dump = (obj: unknown) => yaml.dump(obj, { sortKeys: true });
    return {
      original: dump(compared.applied),
      modified: dump(projectOntoApplied(compared.live, compared.applied, !onlyAppliedFields)),
    };
  }, [compared, showDiff, onlyAppliedFields]);

  if (!compared) {
    return null;
  }

  const inSync = compared.differences === 0;

  return (
    <SectionBox title={t('translation|Last Applied Configuration')}>
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
            icon={inSync ? 'mdi:check-circle' : 'mdi:alert-circle'}
            width="1.2rem"
            height="1.2rem"
            color={inSync ? theme.palette.success.main : theme.palette.warning.main}
            aria-hidden
          />
          <Typography>
            {inSync
              ? t('translation|In sync with the last applied configuration')
              : t('translation|{{count}} fields differ from the last applied configuration', {
                  count: compared.differences,
                })}
          </Typography>
        </Box>
        {showDiff && (
          <FormControlLabel
            control={
              <Switch
                checked={onlyAppliedFields}
                onChange={() => setOnlyAppliedFields(prev => !prev)}
                name="onlyAppliedFields"
              />
            }
            label={t('translation|Only show applied fields')}
          />
        )}
        <Button
          variant="outlined"
          color="primary"
          size="small"
          onClick={() => setShowDiff(prev => !prev)}
          aria-expanded={showDiff}
        >
          {showDiff ? t('translation|Hide diff') : t('translation|Show diff')}
        </Button>
      </Box>
      {diffTexts && (
        <>
          <Box sx={{ display: 'flex', py: 1 }}>
            <Typography variant="body2" sx={{ flex: 1 }}>
              {t('translation|Last applied')}
            </Typography>
            <Typography variant="body2" sx={{ flex: 1 }}>
              {t('translation|Live')}
            </Typography>
          </Box>
          <Box height="400px">
            <DiffEditor
              original={diffTexts.original}
              modified={diffTexts.modified}
              language="yaml"
              theme={theme.palette.mode === 'dark' ? 'vs-dark' : 'light'}
              height="100%"
              options={{
                automaticLayout: true,
                readOnly: true,
                renderSideBySide: true,
                // Keep both columns in the narrow details panel, to match the labels above.
                useInlineViewWhenSpaceIsLimited: false,
              }}
            />
          </Box>
        </>
      )}
    </SectionBox>
  );
}

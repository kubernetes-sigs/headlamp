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
import { Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import Link from '../Link';

interface EnvVarGridProps {
  envVars: any[];
  namespace: string;
  cluster: string;
}

export function EnvVarGrid(props: EnvVarGridProps) {
  const { envVars = [], namespace, cluster } = props;
  const { t } = useTranslation();
  const [expanded, setExpanded] = React.useState(false);
  const defaultNumShown = 20;

  const envEntryStyle = (theme: Theme) => ({
    color: theme.palette.text.primary,
    borderRadius: theme.shape.borderRadius + 'px',
    backgroundColor: theme.palette.background.muted,
    border: '1px solid',
    borderColor: theme.palette.divider,
    fontSize: theme.typography.pxToRem(14),
    padding: '4px 8px',
    marginRight: theme.spacing(1),
    whiteSpace: 'nowrap',
    display: 'inline-block',
  });

  const renderEnvVar = (envVar: any) => {
    // Secret Key:
    if (envVar.valueFrom?.secretKeyRef) {
      const { name: secretName, key: secretKey } = envVar.valueFrom.secretKeyRef;
      const secretUrl = `/c/${cluster}/secrets/${namespace}/${secretName}`;

      return (
        <Typography component="span" sx={envEntryStyle} key={envVar.name}>
          {envVar.name}:{' '}
          <Link to={secretUrl} style={{ textDecoration: 'underline', fontWeight: 'bold' }}>
            Secret: {secretName} (Key: {secretKey})
          </Link>
        </Typography>
      );
    }

    // Config Map:
    if (envVar.valueFrom?.configMapKeyRef) {
      const { name: cmName, key: cmKey } = envVar.valueFrom.configMapKeyRef;
      const secretUrl = `/c/${cluster}/secrets/${namespace}/${cmName}`;
      return (
        <Typography>
          {envVar.name}:{' '}
          <Link to={secretUrl} style={{ textDecoration: 'underline', fontWeight: 'bold' }}>
            ConfigMap: {cmName} (Key: {cmKey})
          </Link>
        </Typography>
      );
    }

    // FieldRef:
    if (envVar.valueFrom?.fieldRef) {
      const { fieldPath } = envVar.valueFrom.fieldRef;
      return (
        <Typography component="span" sx={envEntryStyle} key={envVar.name}>
          {envVar.name}:FieldRef ({fieldPath})
        </Typography>
      );
    }

    // ResourceFieldRef:
    if (envVar.valueFrom?.resourceFieldRef) {
      const { resource } = envVar.valueFrom.resourceFieldRef;
      return (
        <Typography component="span" sx={envEntryStyle} key={envVar.name}>
          {envVar.name}: ResourceField ({resource})
        </Typography>
      );
    }

    // Plaintext
    return (
      <Typography component="span" sx={envEntryStyle} key={envVar.name}>
        {envVar.name}: {envVar.value}
      </Typography>
    );
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {envVars
          .slice(0, expanded ? envVars.length : defaultNumShown)
          .map(env => renderEnvVar(env))}
      </Box>
      {envVars.length > defaultNumShown && (
        <Button
          onClick={() => setExpanded(!expanded)}
          size="small"
          startIcon={<Icon icon={expanded ? 'mdi:menu-up' : 'mdi:menu-down'} />}
        >
          {!expanded
            ? t('translation|Show all environment variables (+{{count}} more)', {
                count: envVars.length - defaultNumShown,
              })
            : t('translation|Show fewer')}
        </Button>
      )}
    </Box>
  );
}

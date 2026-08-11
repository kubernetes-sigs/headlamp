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
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Typography, { TypographyProps } from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { KubeContainer } from '../../../lib/k8s/cluster';
import Secret from '../../../lib/k8s/secret';
import Link from '../Link';
import { SecretField } from './Resource';

interface EnvVarGridProps {
  envVars: NonNullable<KubeContainer['env']>;
  namespace: string;
  cluster: string;
}

export function EnvVarGrid(props: EnvVarGridProps) {
  const { envVars = [], namespace, cluster } = props;
  const { t } = useTranslation();
  const [expanded, setExpanded] = React.useState(false);
  const defaultNumShown = 20;

  const [loadedSecrets, setLoadedSecrets] = React.useState<Record<string, Record<string, string>>>(
    {}
  );
  const [loadingSecrets, setLoadingSecrets] = React.useState<Record<string, boolean>>({});
  const [secretErrors, setSecretErrors] = React.useState<Record<string, string>>({});
  const [visibleSecrets, setVisibleSecrets] = React.useState<Record<string, boolean>>({});

  const toggleSecret = (secretName: string, envVarName: string) => {
    if (visibleSecrets[envVarName]) {
      setVisibleSecrets(prev => ({ ...prev, [envVarName]: false }));
      return;
    }

    setVisibleSecrets(prev => ({ ...prev, [envVarName]: true }));

    if (loadedSecrets[secretName] || loadingSecrets[secretName]) {
      return;
    }

    setLoadingSecrets(prev => ({ ...prev, [secretName]: true }));
    setSecretErrors(prev => {
      const copy = { ...prev };
      delete copy[secretName];
      return copy;
    });

    const request = Secret.apiGet(
      secret => {
        if (secret && secret.data) {
          setLoadedSecrets(prev => ({ ...prev, [secretName]: secret.data }));
        } else {
          setSecretErrors(prev => ({ ...prev, [secretName]: t('translation|No data') }));
        }
        setLoadingSecrets(prev => ({ ...prev, [secretName]: false }));
      },
      secretName,
      namespace,
      err => {
        const errMsg =
          err?.status === 401
            ? t('translation|Unauthorized')
            : err?.status === 403
            ? t('translation|Forbidden')
            : err?.message || t('translation|Failed to load');
        setSecretErrors(prev => ({ ...prev, [secretName]: errMsg }));
        setLoadingSecrets(prev => ({ ...prev, [secretName]: false }));
      },
      { cluster }
    );

    request().catch(err => {
      setSecretErrors(prev => ({
        ...prev,
        [secretName]: err?.message || t('translation|Failed to load'),
      }));
      setLoadingSecrets(prev => ({ ...prev, [secretName]: false }));
    });
  };

  const validEnvVars = envVars.filter(
    env => !!env && typeof env.name === 'string' && env.name.trim() !== ''
  );

  const EnvEntry = React.forwardRef((props: TypographyProps, ref: React.Ref<HTMLElement>) => {
    return (
      <Typography
        {...props}
        sx={theme => ({
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
          maxWidth: '400px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        })}
        ref={ref}
      />
    );
  });
  EnvEntry.displayName = 'EnvEntry';

  const renderEnvVar = (envVar: NonNullable<KubeContainer['env']>[number]) => {
    // Fallback:
    if (!envVar.name) {
      return null;
    }
    // Secret Key:
    if (envVar.valueFrom?.secretKeyRef) {
      const { name: secretName, key: secretKey } = envVar.valueFrom.secretKeyRef;

      if (!secretName) {
        return (
          <EnvEntry component="span" key={envVar.name}>
            {envVar.name}: {t('translation|Invalid Secret Reference')}
          </EnvEntry>
        );
      }

      const secretUrl = `/c/${encodeURIComponent(cluster)}/secrets/${encodeURIComponent(
        namespace
      )}/${encodeURIComponent(secretName)}`;

      const isVisible = !!visibleSecrets[envVar.name];
      const isLoading = !!loadingSecrets[secretName];
      const err = secretErrors[secretName];
      const secretData = loadedSecrets[secretName];
      const hasValue = secretData && secretKey && secretData[secretKey] !== undefined;

      return (
        <EnvEntry
          component="span"
          key={envVar.name}
          sx={{ display: 'inline-flex', alignItems: 'center' }}
        >
          <Box
            display="inline-flex"
            alignItems="center"
            sx={{ verticalAlign: 'middle', width: '100%' }}
          >
            <Typography component="span" sx={{ mr: 0.5, fontWeight: 'medium' }}>
              {envVar.name}:
            </Typography>
            {isVisible && hasValue ? (
              <SecretField
                disableUnderline
                value={secretData[secretKey]}
                sx={{ fontFamily: 'monospace', display: 'inline-flex' }}
              />
            ) : (
              <Box display="inline-flex" alignItems="center">
                <Link to={secretUrl} style={{ textDecoration: 'underline', fontWeight: 'bold' }}>
                  Secret: {secretName} {secretKey ? `(Key: ${secretKey})` : ''}
                </Link>
                {isLoading && <CircularProgress size={16} sx={{ ml: 1 }} />}
                {err && (
                  <Typography color="error" variant="caption" sx={{ ml: 1 }}>
                    ({err})
                  </Typography>
                )}
              </Box>
            )}
            {!isLoading && (
              <IconButton
                size="small"
                onClick={() => toggleSecret(secretName, envVar.name)}
                sx={{ ml: 0.5 }}
                aria-label={isVisible ? t('translation|Hide') : t('translation|Show')}
              >
                <Icon icon={isVisible ? 'mdi:eye-off' : 'mdi:eye'} />
              </IconButton>
            )}
          </Box>
        </EnvEntry>
      );
    }

    // Config Map:
    if (envVar.valueFrom?.configMapKeyRef) {
      const { name: cmName, key: cmKey } = envVar.valueFrom.configMapKeyRef;

      if (!cmName) {
        return (
          <EnvEntry component="span" key={envVar.name}>
            {envVar.name}: {t('translation|Invalid Config Map Reference')}
          </EnvEntry>
        );
      }

      const configMapUrl = `/c/${encodeURIComponent(cluster)}/configmaps/${encodeURIComponent(
        namespace
      )}/${encodeURIComponent(cmName)}`;
      return (
        <EnvEntry component="span" key={envVar.name}>
          {envVar.name}:{' '}
          <Link to={configMapUrl} style={{ textDecoration: 'underline', fontWeight: 'bold' }}>
            ConfigMap: {cmName} {cmKey ? `(Key: ${cmKey})` : ''}
          </Link>
        </EnvEntry>
      );
    }

    // FieldRef:
    if (envVar.valueFrom?.fieldRef) {
      const { fieldPath } = envVar.valueFrom.fieldRef;
      return (
        <EnvEntry component="span" key={envVar.name}>
          {envVar.name}: FieldRef {fieldPath ? `(${fieldPath})` : t('translation|Invalid fieldRef')}
        </EnvEntry>
      );
    }

    // ResourceFieldRef:
    if (envVar.valueFrom?.resourceFieldRef) {
      const { resource } = envVar.valueFrom.resourceFieldRef;
      return (
        <EnvEntry component="span" key={envVar.name}>
          {envVar.name}: ResourceField{' '}
          {resource ? `(${resource})` : t('translation|Invalid resourceFieldRef')}
        </EnvEntry>
      );
    }

    // Plaintext
    return (
      <EnvEntry component="span" key={envVar.name}>
        {envVar.name}: {(envVar.value || '').trim()}
      </EnvEntry>
    );
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {validEnvVars
          .slice(0, expanded ? validEnvVars.length : defaultNumShown)
          .map(env => renderEnvVar(env))}
      </Box>
      {validEnvVars.length > defaultNumShown && (
        <Button
          onClick={() => setExpanded(!expanded)}
          size="small"
          aria-expanded={expanded}
          aria-label={
            expanded ? t('translation|Show fewer') : t('translation|Show all environment variables')
          }
          startIcon={<Icon icon={expanded ? 'mdi:menu-up' : 'mdi:menu-down'} />}
          sx={{ mt: 1, mb: 1 }}
        >
          {!expanded
            ? t('translation|Show all environment variables (+{{count}} more)', {
                count: validEnvVars.length - defaultNumShown,
              })
            : t('translation|Show fewer')}
        </Button>
      )}
    </Box>
  );
}

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

import { Box, Button, styled, Typography } from '@mui/material';
import { Trans } from 'react-i18next';
import { ApiResource } from '../../lib/k8s/api/v2/ApiResource';
import { KubeIcon } from '../resourceMap/kubeIcon/KubeIcon';

const StyledPre = styled('pre')({
  margin: 0,
});

function QueryExample({
  children,
  resources,
  onSelect,
}: {
  children: string;
  resources: ApiResource[];
  onSelect: (resources: ApiResource[], query: string) => void;
}) {
  return (
    <Button
      variant="contained"
      color="secondary"
      onClick={() => onSelect(resources, children)}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
      }}
    >
      {resources.length === 1 ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <KubeIcon kind={resources[0].kind as any} width="24px" height="24px" />{' '}
          {resources[0].kind}{' '}
        </Box>
      ) : (
        <Trans>All Resources</Trans>
      )}
      <Box>
        <StyledPre>{children}</StyledPre>
      </Box>
    </Button>
  );
}

/**
 * Placeholder for when there are no results
 */
export function EmptyResults({
  resources,
  onQuerySelected,
}: {
  resources: ApiResource[];
  onQuerySelected: (resources: ApiResource[], query: string) => void;
}) {
  const pod = resources.find(it => it.kind === 'Pod');
  const configMap = resources.find(it => it.kind === 'ConfigMap');
  const job = resources.find(it => it.kind === 'Job');

  return (
    <Box sx={{ p: 2, display: 'flex', alignItems: 'center', flexDirection: 'column', gap: 1 }}>
      <Typography variant="body1" sx={{ marginTop: 3 }}>
        <Trans>Examples</Trans>
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
        {pod && (
          <QueryExample onSelect={onQuerySelected} resources={[pod]}>
            status.phase !== "Running"
          </QueryExample>
        )}
        <QueryExample onSelect={onQuerySelected} resources={resources}>
          metadata.labels["kubernetes.io/cluster-service"] === "true"
        </QueryExample>
        {configMap && (
          <QueryExample onSelect={onQuerySelected} resources={[configMap]}>
            !!data
          </QueryExample>
        )}
        <QueryExample onSelect={onQuerySelected} resources={resources}>
          {`metadata.annotations["deployment.kubernetes.io/revision"] > 10`}
        </QueryExample>
        {job && (
          <QueryExample onSelect={onQuerySelected} resources={[job]}>
            {`spec.suspend === false && status.succeeded > 0`}
          </QueryExample>
        )}
      </Box>
    </Box>
  );
}

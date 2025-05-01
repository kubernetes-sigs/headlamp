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

import { Typography } from '@mui/material';
import { matchExpressionSimplifier, matchLabelsSimplifier } from '../../../lib/k8s';
import { LabelSelector } from '../../../lib/k8s/cluster';
import { metadataStyles } from '.';

export interface MatchExpressionsProps {
  matchLabels?: LabelSelector['matchLabels'];
  matchExpressions?: LabelSelector['matchExpressions'];
}

export function MatchExpressions(props: MatchExpressionsProps) {
  const { matchLabels = {}, matchExpressions = [] } = props;

  function prepareMatchLabelsAndExpressions(
    matchLabels: LabelSelector['matchLabels'],
    matchExpressions: LabelSelector['matchExpressions']
  ) {
    const matchLabelsSimplified = matchLabelsSimplifier(matchLabels) || [];
    const matchExpressionsSimplified = matchExpressionSimplifier(matchExpressions) || [];

    return (
      <>
        {matchLabelsSimplified.map(label => (
          <Typography sx={metadataStyles} display="inline" key={label}>
            {label}
          </Typography>
        ))}
        {matchExpressionsSimplified.map(expression => (
          <Typography sx={metadataStyles} display="inline" key={expression}>
            {expression}
          </Typography>
        ))}
      </>
    );
  }

  return <>{prepareMatchLabelsAndExpressions(matchLabels, matchExpressions)}</>;
}

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
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import CertificateSigningRequest from '../../lib/k8s/certificateSigningRequest';
import type { KubeCondition } from '../../lib/k8s/cluster';
import { formatDuration } from '../../lib/util';
import { ConditionList } from '../common/ConditionList';
import { DetailsGrid } from '../common/Resource';
import CopyButton from '../common/Resource/CopyButton';
import SectionBox from '../common/SectionBox';
import CertificateSigningRequestStatus from './CertificateSigningRequestStatus';

/** PEM shown as it is, since nothing in the frontend parses it. */
function PEMBlock(props: { title: string; text: string }) {
  return (
    <SectionBox title={props.title}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, px: 2, pb: 1 }}>
        <Typography
          component="pre"
          variant="body2"
          sx={{
            fontFamily: 'monospace',
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            flexGrow: 1,
          }}
        >
          {props.text}
        </Typography>
        <CopyButton text={props.text} />
      </Box>
    </SectionBox>
  );
}

export default function CertificateSigningRequestDetails(props: {
  name?: string;
  cluster?: string;
}) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={CertificateSigningRequest}
      name={name}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Status'),
            value: <CertificateSigningRequestStatus state={item.state} />,
          },
          {
            name: t('translation|Signer'),
            value: item.signerName,
          },
          {
            name: t('translation|Requestor'),
            value: item.requestor,
            hide: !item.requestor,
          },
          {
            name: t('glossary|Groups'),
            value: item.groups.join(', '),
            hide: item.groups.length === 0,
          },
          {
            name: t('translation|Usages'),
            value: item.usages.join(', '),
            hide: item.usages.length === 0,
          },
          {
            name: t('translation|Requested Duration'),
            value: item.expirationSeconds && formatDuration(item.expirationSeconds * 1000),
            hide: !item.expirationSeconds,
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.csr-conditions',
            section: (
              <SectionBox title={t('translation|Conditions')}>
                {/* CSR conditions carry lastUpdateTime and never a lastProbeTime, which
                    the shared condition type marks as required. */}
                <ConditionList
                  conditions={item.conditions as unknown as KubeCondition[]}
                  showLastUpdate
                />
              </SectionBox>
            ),
          },
          {
            id: 'headlamp.csr-request',
            section: <PEMBlock title={t('translation|Request')} text={item.requestPEM} />,
          },
          {
            id: 'headlamp.csr-certificate',
            section: item.isIssued ? (
              <PEMBlock title={t('translation|Issued Certificate')} text={item.certificatePEM} />
            ) : null,
          },
        ]
      }
    />
  );
}

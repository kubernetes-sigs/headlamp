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
import ClusterTrustBundle from '../../lib/k8s/clusterTrustBundle';
import { DetailsGrid } from '../common/Resource';
import CopyButton from '../common/Resource/CopyButton';
import SectionBox from '../common/SectionBox';

/**
 * One certificate of the bundle, shown as the PEM it is. Nothing in the frontend
 * parses X.509 yet, so the subject and validity are not broken out.
 */
function CertificateBlock(props: { label: string; text: string }) {
  return (
    <Box sx={{ px: 2, pb: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        {props.label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
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
    </Box>
  );
}

export default function ClusterTrustBundleDetails(props: { name?: string; cluster?: string }) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={ClusterTrustBundle}
      name={name}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Signer'),
            value: item.signerName || t('translation|None'),
          },
          {
            name: t('translation|Certificates'),
            value: item.certificateCount.toString(),
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.clustertrustbundle-certificates',
            section: (
              <SectionBox title={t('translation|Certificates')}>
                {item.certificateCount === 0 ? (
                  <Typography sx={{ px: 2, pb: 1 }}>
                    {t('translation|This bundle carries no certificates.')}
                  </Typography>
                ) : (
                  item.certificates.map((certificate, index) => (
                    <CertificateBlock
                      key={index}
                      label={t('translation|Certificate {{ index }}', { index: index + 1 })}
                      text={certificate}
                    />
                  ))
                )}
              </SectionBox>
            ),
          },
        ]
      }
    />
  );
}

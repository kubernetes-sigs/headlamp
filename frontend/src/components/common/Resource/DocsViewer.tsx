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
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import getDocDefinitions from '../../../lib/docs';
import Empty from '../EmptyContent';
import Loader from '../Loader';

export interface DocsViewerProps {
  docSpecs: { apiVersion?: string; kind: string }[];
}

function DocNode({ name, value }: { name: string; value: any }) {
  const [open, setOpen] = React.useState(false);
  const childProps = Object.entries(value.properties || {});

  const isExpandable = !!value.description || childProps.length > 0;

  const handleToggle = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      return;
    }
    if (isExpandable) {
      setOpen(!open);
    }
  };

  return (
    <Box sx={{ mt: 0.5 }}>
      <Box display="flex" alignItems="flex-start">
        <Box
          sx={{
            mr: 0.5,
            mt: 0.25,
            cursor: isExpandable ? 'pointer' : 'default',
            display: 'flex',
            color: 'text.secondary',
          }}
          onClick={handleToggle}
        >
          {isExpandable ? (
            <Icon
              icon={open ? 'mdi:chevron-down' : 'mdi:chevron-right'}
              width="1.2em"
              height="1.2em"
            />
          ) : (
            <Box sx={{ width: '1.2em' }} />
          )}
        </Box>
        <Box sx={{ flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
          <Box
            onClick={handleToggle}
            role={isExpandable ? 'button' : undefined}
            tabIndex={isExpandable ? 0 : undefined}
            aria-expanded={isExpandable ? open : undefined}
            onKeyDown={event => {
              if (isExpandable && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                setOpen(current => !current);
              }
            }}
            sx={{ cursor: isExpandable ? 'pointer' : 'default', display: 'inline-block' }}
          >
            <Typography display="inline" sx={{ userSelect: 'text' }}>
              {name}
            </Typography>
            &nbsp;
            <Typography
              display="inline"
              color="textSecondary"
              variant="caption"
              sx={{ userSelect: 'text' }}
            >
              ({value.type})
            </Typography>
          </Box>
          {isExpandable && (
            <Box sx={{ pl: 2, display: open ? 'block' : 'none' }}>
              {value.description && (
                <Typography
                  color="textSecondary"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    userSelect: 'text',
                    mb: 1,
                    wordBreak: 'break-word',
                  }}
                >
                  {value.description}
                </Typography>
              )}
              {childProps.length > 0 && (
                <Box>
                  {childProps.map(([childName, childValue]) => (
                    <DocNode key={childName} name={childName} value={childValue} />
                  ))}
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function DocsViewer(props: DocsViewerProps) {
  const { docSpecs } = props;
  const [docs, setDocs] = React.useState<
    (
      | {
          data: null;
          error: any;
          kind: string;
        }
      | {
          data: any;
          error: null;
          kind: string;
        }
      | undefined
    )[]
  >([]);
  const [docsLoading, setDocsLoading] = React.useState(false);
  const { t } = useTranslation();

  React.useEffect(() => {
    setDocsLoading(true);
    // fetch docSpecs for all the resources specified
    Promise.allSettled(
      docSpecs.map(docSpec => {
        return getDocDefinitions(docSpec.apiVersion ?? '', docSpec.kind);
      })
    )
      .then(values => {
        const docSpecsFromApi = values.map((value, index) => {
          if (value.status === 'fulfilled') {
            return {
              data: value.value,
              error: null,
              kind: docSpecs[index].kind,
            };
          } else if (value.status === 'rejected') {
            return {
              data: null,
              error: value.reason,
              kind: docSpecs[index].kind,
            };
          }
        });
        setDocsLoading(false);
        setDocs(docSpecsFromApi);
      })
      .catch(() => {
        setDocsLoading(false);
      });
  }, [docSpecs]);

  return (
    <>
      {docsLoading ? (
        <Loader title={t('Loading documentation')} />
      ) : docs.length === 0 ? (
        <Empty>{t('No documentation available.')}</Empty>
      ) : (
        docs.map((docSpec: any, idx: number) => {
          if (!docSpec.error && !docSpec.data) {
            return (
              <Empty key={`empty_msg_${idx}`}>
                {t('No documentation for type {{ docsType }}.', {
                  docsType: docSpec?.kind?.trim() || '""',
                })}
              </Empty>
            );
          }
          if (docSpec.error) {
            return (
              <Empty color="error" key={`empty_msg_${idx}`}>
                {docSpec.error.message}
              </Empty>
            );
          }
          if (docSpec.data) {
            return (
              <Box p={2} key={`docs_${idx}`}>
                <Typography>
                  {t('Showing documentation for: {{ docsType }}', {
                    docsType: docSpec.kind.trim(),
                  })}
                </Typography>
                <Box sx={{ flexGrow: 1, maxWidth: 400 }}>
                  {Object.entries(docSpec.data.properties || {}).map(([name, value]) => (
                    <DocNode key={name} name={name} value={value} />
                  ))}
                </Box>
              </Box>
            );
          }
        })
      )}
    </>
  );
}

export default DocsViewer;

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
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { TreeView } from '@mui/x-tree-view/TreeView';
import React from 'react';
import { useTranslation } from 'react-i18next';
import getDocDefinitions from '../../../lib/docs';
import Empty from '../EmptyContent';
import Loader from '../Loader';

export interface DocsViewerProps {
  // @todo: Declare strict types.
  docSpecs: any;
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
      docSpecs.map((docSpec: { apiVersion: string; kind: string }) => {
        return getDocDefinitions(docSpec.apiVersion, docSpec.kind);
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

  function makeItems(name: string, value: any, key: string) {
    return (
      <TreeItem
        key={key}
        nodeId={`${key}`}
        label={
          <div>
            <Typography display="inline">{name}</Typography>&nbsp;
            <Typography display="inline" color="textSecondary" variant="caption">
              ({value.type})
            </Typography>
          </div>
        }
      >
        <Typography color="textSecondary">{value.description}</Typography>
        {Object.entries(value.properties || {}).map(([name, value], i) =>
          makeItems(name, value, `${key}_${i}`)
        )}
      </TreeItem>
    );
  }

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
                <TreeView
                  sx={{ flexGrow: 1, maxWidth: 400 }}
                  defaultCollapseIcon={<Icon icon="mdi:chevron-down" />}
                  defaultExpandIcon={<Icon icon="mdi:chevron-right" />}
                >
                  {Object.entries(docSpec.data.properties || {}).map(([name, value], i) =>
                    makeItems(name, value, i.toString())
                  )}
                </TreeView>
              </Box>
            );
          }
        })
      )}
    </>
  );
}

export default DocsViewer;

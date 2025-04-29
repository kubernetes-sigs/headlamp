import { Icon } from '@iconify/react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
// import * as buffer from 'buffer';
import React from 'react';
import { useTranslation } from 'react-i18next';
import getDocDefinitions from '../../../lib/docs';
import Empty from '../EmptyContent';
import Loader from '../Loader';

export interface DocsViewerProps {
  // @todo: Declare strict types.
  docSpecs: any;
}

function IconCollapse() {
  return <Icon icon="mdi:chevron-down" />;
}

function IconExpand() {
  return <Icon icon="mdi:chevron-right" />;
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
        itemId={key}
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
                <SimpleTreeView
                  sx={{ flexGrow: 1, maxWidth: 400 }}
                  slots={{ collapseIcon: IconCollapse, expandIcon: IconExpand }}
                >
                  {Object.entries(docSpec.data.properties || {}).map(([name, value], i) =>
                    makeItems(name, value, i.toString())
                  )}
                </SimpleTreeView>
              </Box>
            );
          }
        })
      )}
    </>
  );
}

export default DocsViewer;

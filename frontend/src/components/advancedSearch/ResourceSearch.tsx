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
import { Editor, Monaco, useMonaco } from '@monaco-editor/react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  GlobalStyles,
  IconButton,
  Tooltip,
  useTheme,
} from '@mui/material';
import * as monaco from 'monaco-editor';
import React from 'react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { ApiResource } from '../../lib/k8s/api/v2/ApiResource';
import { KubeObject } from '../../lib/k8s/KubeObject';
import { Activity } from '../activity/Activity';
import { EditorDialog, Link } from '../common';
import ResourceTable from '../common/Resource/ResourceTable';
import { canRenderDetails } from '../resourceMap/details/KubeNodeDetails';
import { KubeIcon } from '../resourceMap/kubeIcon/KubeIcon';
import { searchWithQuery } from './utils/searchWithQuery';
import { useKubeLists } from './utils/useKubeLists';
import { useTypeDefinition } from './utils/useTypeDefinition';

const editorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: false },
  scrollbar: {
    vertical: 'hidden',
    horizontal: 'auto',
  },
  lineNumbers: 'off',
  scrollBeyondLastLine: false,
  wordWrap: 'off', // Ensure it stays on one line unless explicitly wrapped
  folding: false,
  glyphMargin: false,
  lineDecorationsWidth: 16,
  renderLineHighlight: 'none', // Don't highlight the current line
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  automaticLayout: true, // Adjust layout on container resize
  fontSize: 16,
};

const maxResults = 1_000;

export function ResourceSearch({
  resources,
  selectedClusters,
  rawQuery,
  maxItemsPerResource,
  refetchIntervalMs,
  setRawQuery,
}: {
  resources: ApiResource[];
  selectedClusters: string[];
  rawQuery: string;
  maxItemsPerResource: number;
  refetchIntervalMs: number;
  setRawQuery: (q?: string) => void;
}) {
  const { t } = useTranslation();
  const [isFocused, setIsFocused] = useState(false);
  const theme = useTheme();
  const monaco = useMonaco();
  const {
    items: allItems,
    errors,
    isLoading,
  } = useKubeLists(resources, selectedClusters, maxItemsPerResource, refetchIntervalMs);
  const jsonDataItems = useMemo(
    () =>
      allItems.map(it => {
        delete it.jsonData.metadata.managedFields;
        return it.jsonData;
      }),
    [allItems]
  );
  const deferredQuery = useDeferredValue(rawQuery);

  const [results, setResults] = useState<{ items: any[]; query: string }>({ items: [], query: '' });

  // Perform search when query changes
  useEffect(() => {
    const interruptRef = { current: false };

    searchWithQuery(allItems, deferredQuery, interruptRef).then(result => {
      if (interruptRef.current === false) {
        setResults({ items: result.results, query: deferredQuery });
      }
    });

    return () => {
      interruptRef.current = true;
    };
  }, [deferredQuery, allItems]);

  const deferredResults = useDeferredValue(results);

  const fullTypeDefinition = useTypeDefinition(jsonDataItems, 1000);

  useEffect(() => {
    if (monaco) {
      monaco.languages.typescript.javascriptDefaults.setExtraLibs([
        {
          content: fullTypeDefinition,
          filePath: 'globalTypes.d.ts',
        },
      ]);
    }
  }, [fullTypeDefinition, monaco]);

  const shouldHideTable =
    // When items are still loading
    isLoading ||
    // When there's no query
    rawQuery.trim().length === 0 ||
    // Or results are not ready yet
    (deferredResults.items.length === 0 && deferredResults.query !== rawQuery);

  function handleEditorWillMount(monaco: Monaco) {
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      noLib: false,
      allowNonTsExtensions: true,
      lib: ['esnext'],
    });
  }

  return (
    <>
      <Box
        sx={theme => ({
          display: 'flex',
          alignItems: 'center',
          border: '1px solid',
          borderColor: theme.palette.divider,
          padding: 1,
          borderRadius: '8px',
          boxShadow: '2px 2px 15px rgba(0,0,0,0.07)',
          position: 'relative',
        })}
      >
        <GlobalStyles
          styles={{
            '.monaco-editor, .monaco-editor-background, .monaco-editor .margin': {
              background: 'transparent !important',
              backgroundColor: 'transparent !important',
              outlineColor: 'transparent !important',
            },
          }}
        />
        {!isFocused && rawQuery === '' && (
          <Box
            sx={theme => ({
              position: 'absolute',
              opacity: 0.6,
              left: theme.spacing(3),
            })}
          >
            <Trans>Search resources by query</Trans>
          </Box>
        )}
        <Box sx={{ paddingY: 1, width: '100%' }}>
          <Editor
            options={editorOptions}
            language="javascript"
            beforeMount={handleEditorWillMount}
            value={rawQuery}
            theme={theme.palette.mode === 'dark' ? 'vs-dark' : 'light'}
            wrapperProps={{
              onFocus: () => setIsFocused(true),
              onBlur: () => setIsFocused(false),
            }}
            onChange={value => {
              setRawQuery(value);
            }}
            onMount={editor => {
              editor.onDidContentSizeChange(size => {
                const editorNode = editor.getDomNode();
                if (editorNode) {
                  editorNode.style.height = size.contentHeight + 'px';
                }
              });
            }}
          />
        </Box>
        <Tooltip title={<Trans>Clear</Trans>} sx={{ opacity: rawQuery.length ? 1 : 0 }}>
          <IconButton onClick={() => setRawQuery('')} aria-label={t('Clear')}>
            <Icon icon="mdi:close" />
          </IconButton>
        </Tooltip>
      </Box>
      <Box
        sx={{
          fontSize: '0.85rem',
          opacity: 0.7,
          ml: 1,
          height: '32px',
          display: 'flex',
          gap: 1,
          alignItems: 'center',
        }}
      >
        {resources.length === 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Icon icon="mdi:warning" />
            <Trans>No resources selected</Trans>
          </Box>
        )}
        {resources.length > 0 && isLoading && <CircularProgress size={18} />}
        {resources.length > 0 && !isLoading && (
          <Box>{t('Loaded {{0}} items', { 0: allItems.length })}</Box>
        )}
        {errors.length > 0 && (
          <Tooltip
            title={
              errors
                .slice(0, 5)
                .map(it => it.resource.kind)
                .join(', ') + (errors.length > 5 ? ', +' + (errors.length - 5) : '')
            }
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Icon icon="mdi:warning" /> <Trans>Some resources failed to load</Trans>
            </Box>
          </Tooltip>
        )}
      </Box>

      {deferredResults.items.length > maxResults && (
        <Alert severity="warning">
          {t('Found {{0}} results. Showing first {{1}}', {
            0: deferredResults.items.length,
            1: maxResults,
          })}
        </Alert>
      )}

      <Box
        sx={{
          overflowY: 'auto',
        }}
      >
        {!shouldHideTable && (
          <ResourceTable
            id="headlamp-advanced-search"
            defaultSortingColumn={{ id: 'name', desc: false }}
            columns={[
              'kind',
              {
                id: 'name',
                label: t('translation|Name'),
                gridTemplate: 'auto',
                getValue: item => item.metadata.name,
                render: item =>
                  canRenderDetails(item.kind) ? <Link kubeObject={item} /> : item.metadata.name,
              },
              'namespace',
              {
                label: t('translation|Cluster'),
                getValue: item => item.cluster,
                render: item => <Box sx={{ whiteSpace: 'nowrap' }}>{item.cluster}</Box>,
                gridTemplate: 'min-content',
              },
              'age',
              {
                label: t('translation|Actions'),
                getValue: () => '',
                gridTemplate: 'min-content',
                render: item => <ViewYaml item={item} />,
              },
            ]}
            data={deferredResults.items.slice(0, maxResults) ?? []}
            hideColumns={selectedClusters.length > 1 ? undefined : ['cluster']}
          />
        )}
      </Box>
    </>
  );
}

export function ViewYaml({ item }: { item: KubeObject }) {
  return (
    <>
      <Button
        size="small"
        variant="contained"
        color="secondary"
        onClick={() => {
          const id = 'view-yaml-' + item.metadata.uid;
          Activity.launch({
            id,
            location: 'full',
            icon: <KubeIcon kind={item.kind} />,
            title: item.kind + ': ' + item.metadata.name,
            content: (
              <EditorDialog
                noDialog
                open
                item={item.jsonData}
                onClose={() => Activity.close(id)}
                onSave={null}
              />
            ),
          });
        }}
        sx={{ whiteSpace: 'nowrap' }}
        startIcon={<Icon icon="mdi:eye" />}
      >
        YAML
      </Button>
    </>
  );
}

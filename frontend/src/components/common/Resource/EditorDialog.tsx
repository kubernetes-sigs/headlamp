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

import '../../../i18n/config';
import { Icon } from '@iconify/react';
import Editor, { loader } from '@monaco-editor/react';
import { InputAdornment, TextField } from '@mui/material';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Grid from '@mui/material/Grid';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import * as yaml from 'js-yaml';
import _ from 'lodash';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { getCluster } from '../../../lib/cluster';
import { apply } from '../../../lib/k8s/apiProxy';
import { KubeObjectInterface } from '../../../lib/k8s/KubeObject';
import { useId } from '../../../lib/util';
import { clusterAction } from '../../../redux/clusterActionSlice';
import {
  EventStatus,
  HeadlampEventType,
  useEventCallback,
} from '../../../redux/headlampEventSlice';
import { AppDispatch } from '../../../redux/stores/store';
import { useCurrentAppTheme } from '../../App/themeSlice';
import { useLocalStorageState } from '../../globalSearch/useLocalStorageState';
import ConfirmButton from '../ConfirmButton';
import { Dialog, DialogProps } from '../Dialog';
import Loader from '../Loader';
import Tabs from '../Tabs';
import DocsViewer from './DocsViewer';
import SimpleEditor from './SimpleEditor';

type KubeObjectIsh = Partial<KubeObjectInterface>;

export interface EditorDialogProps extends DialogProps {
  /** The object(s) to edit, or null to make the dialog be in "loading mode". Pass it an empty object if no contents are to be shown when the dialog is first open. */
  item: KubeObjectIsh | object | object[] | string | null;
  /** Called when the dialog is closed. */
  onClose: () => void;
  /** Called by a component for when the user clicks the save button. When set to "default", internal save logic is applied. */
  onSave?: ((...args: any[]) => void) | 'default' | null;
  /** Called when the editor's contents change. */
  onEditorChanged?: ((newValue: string) => void) | null;
  /** The function to open the dialog. */
  setOpen?: (open: boolean) => void;
  allowToHideManagedFields?: boolean;
  /** The label to use for the save button. */
  saveLabel?: string;
  /** The error message to display. */
  errorMessage?: string;
  /** The dialog title. */
  title?: string;
  /** Extra optional actions. */
  actions?: React.ReactNode[];
  /** Don't render the editor in the dialog */
  noDialog?: boolean;
}

export default function EditorDialog(props: EditorDialogProps) {
  const {
    item,
    onClose,
    onSave = 'default',
    onEditorChanged,
    setOpen,
    saveLabel,
    errorMessage,
    allowToHideManagedFields,
    title,
    actions = [],
    ...other
  } = props;
  const editorOptions = {
    selectOnLineNumbers: true,
    readOnly: isReadOnly(),
    automaticLayout: true,
  };
  const { i18n } = useTranslation();
  const [lang, setLang] = React.useState(i18n.language);

  const initialCode = typeof item === 'string' ? item : yaml.dump(item || {});
  const originalCodeRef = React.useRef({ code: initialCode, format: item ? 'yaml' : '' });
  const [code, setCode] = React.useState(originalCodeRef.current);
  const codeRef = React.useRef(code);
  const lastCodeCheckHandler = React.useRef(0);
  const previousVersionRef = React.useRef(
    isKubeObjectIsh(item) ? item?.metadata?.resourceVersion || '' : ''
  );
  const [error, setError] = React.useState('');
  const [docSpecs, setDocSpecs] = React.useState<
    KubeObjectInterface | KubeObjectInterface[] | null
  >([]);
  const { t } = useTranslation();

  const theme = useCurrentAppTheme();

  const [hideManagedFields, setHideManagedFields] = useLocalStorageState<boolean>(
    'hideManagedFields',
    true
  );
  const [useSimpleEditor, setUseSimpleEditor] = useLocalStorageState<boolean>(
    'useSimpleEditor',
    false
  );
  const [uploadYaml, setUploadYaml] = React.useState<boolean>(false);

  const dispatchCreateEvent = useEventCallback(HeadlampEventType.CREATE_RESOURCE);
  const dispatch: AppDispatch = useDispatch();

  function isKubeObjectIsh(item: any): item is KubeObjectIsh {
    return item && typeof item === 'object' && !Array.isArray(item) && 'metadata' in item;
  }

  // Update the code when the item changes, but only if the code hasn't been touched.
  React.useEffect(() => {
    const clonedItem = _.cloneDeep(item);
    if (!item || Object.keys(item || {}).length === 0) {
      const defaultCode = '# Enter your YAML or JSON here';
      originalCodeRef.current = { code: defaultCode, format: 'yaml' };
      setCode({ code: defaultCode, format: 'yaml' });
      return;
    }

    if (allowToHideManagedFields && hideManagedFields) {
      if (isKubeObjectIsh(clonedItem) && clonedItem.metadata) {
        delete clonedItem.metadata.managedFields;
      }
    }

    // Determine the format (YAML or JSON) and serialize to string
    const format = looksLikeJson(originalCodeRef.current.code) ? 'json' : 'yaml';
    const itemCode = format === 'json' ? JSON.stringify(clonedItem) : yaml.dump(clonedItem);

    // Update the code if the item representation has changed
    if (itemCode !== originalCodeRef.current.code) {
      originalCodeRef.current = { code: itemCode, format };
      setCode({ code: itemCode, format });
    }

    // Additional handling for Kubernetes objects
    if (isKubeObjectIsh(item) && item.metadata) {
      const resourceVersionsDiffer =
        (previousVersionRef.current || '') !== (item.metadata!.resourceVersion || '');
      // Only change if the code hasn't been touched.
      // We use the codeRef in this effect instead of the code, because we need to access the current
      // state of the code but we don't want to trigger a re-render when we set the code here.
      if (resourceVersionsDiffer || codeRef.current.code === originalCodeRef.current.code) {
        // Prevent updating to the same code, which would lead to an infinite loop.
        if (codeRef.current.code !== itemCode) {
          setCode({ code: itemCode, format: originalCodeRef.current.format });
        }

        if (resourceVersionsDiffer && !!item.metadata!.resourceVersion) {
          previousVersionRef.current = item.metadata!.resourceVersion;
        }
      }
    }
  }, [item, hideManagedFields]);

  React.useEffect(() => {
    codeRef.current = code;
  }, [code]);

  React.useEffect(() => {
    i18n.on('languageChanged', setLang);
    return () => {
      // Stop the timeout from trying to use the component after it's been unmounted.
      clearTimeout(lastCodeCheckHandler.current);

      i18n.off('languageChanged', setLang);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function isReadOnly() {
    return onSave === null;
  }

  function looksLikeJson(code: string) {
    const trimmedCode = code.trimLeft();
    const firstChar = !!trimmedCode ? trimmedCode[0] : '';
    if (['{', '['].includes(firstChar)) {
      return true;
    }
    return false;
  }

  function onChange(value: string | undefined): void {
    // Clear any ongoing attempts to check the code.
    window.clearTimeout(lastCodeCheckHandler.current);

    // Only check the code for errors after the user has stopped typing for a moment.
    lastCodeCheckHandler.current = window.setTimeout(() => {
      const { error: err, format } = getObjectsFromCode({
        code: value || '',
        format: originalCodeRef.current.format,
      });
      if (code.format !== format) {
        setCode(currentCode => ({ code: currentCode.code || '', format }));
      }

      if (error !== (err?.message || '')) {
        setError(err?.message || '');
      }
    }, 500); // ms

    setCode(currentCode => ({ code: value as string, format: currentCode.format }));

    if (onEditorChanged) {
      onEditorChanged(value as string);
    }
  }

  function getObjectsFromCode(codeInfo: typeof originalCodeRef.current): {
    obj: KubeObjectInterface[] | null;
    format: string;
    error: Error | null;
  } {
    const { code, format } = codeInfo;
    const res: { obj: KubeObjectInterface[] | null; format: string; error: Error | null } = {
      obj: null,
      format,
      error: null,
    };

    if (!format || (!res.obj && looksLikeJson(code))) {
      res.format = 'json';
      try {
        let helperArr = [];
        const parsedCode = JSON.parse(code);
        if (!Array.isArray(parsedCode)) {
          helperArr.push(parsedCode);
        } else {
          helperArr = parsedCode;
        }
        res.obj = helperArr;
        return res;
      } catch (e) {
        res.error = new Error((e as Error).message || t('Invalid JSON'));
      }
    }

    if (!res.obj) {
      res.format = 'yaml';
      try {
        res.obj = yaml.loadAll(code) as KubeObjectInterface[];
        res.obj = res.obj.filter(obj => !!obj);
        return res;
      } catch (e) {
        res.error = new Error((e as Error).message || t('Invalid YAML'));
      }
    }

    if (!!res.obj) {
      res.error = null;
    }

    return res;
  }

  function handleTabChange(tabIndex: number) {
    // Check if the docs tab has been selected.
    if (tabIndex !== 1) {
      return;
    }

    const { obj: codeObjs } = getObjectsFromCode(code);
    setDocSpecs(codeObjs);
  }

  function onUndo() {
    setCode(originalCodeRef.current);
  }

  const applyFunc = async (newItems: KubeObjectInterface[], clusterName: string) => {
    await Promise.allSettled(newItems.map(newItem => apply(newItem, clusterName))).then(
      (values: any) => {
        values.forEach((value: any, index: number) => {
          if (value.status === 'rejected') {
            let msg;
            const kind = newItems[index].kind;
            const name = newItems[index].metadata.name;
            const apiVersion = newItems[index].apiVersion;
            if (newItems.length === 1) {
              msg = t('translation|Failed to create {{ kind }} {{ name }}.', { kind, name });
            } else {
              msg = t('translation|Failed to create {{ kind }} {{ name }} in {{ apiVersion }}.', {
                kind,
                name,
                apiVersion,
              });
            }
            const errorDetail = value.reason?.message || msg;
            setError(errorDetail);
            setOpen?.(true);
            // throw msg;
            throw new Error(msg);
          }
        });
      }
    );
  };

  function handleSave() {
    // Verify the YAML even means anything before trying to use it.
    const { obj, format, error } = getObjectsFromCode(code);
    if (!!error) {
      setError(t('Error parsing the code: {{error}}', { error: error.message }));
      return;
    }

    if (format !== code.format) {
      setCode(currentCode => ({ code: currentCode.code, format }));
    }

    if (!getObjectsFromCode(code)) {
      setError(t("Error parsing the code. Please verify it's valid YAML or JSON!"));
      return;
    }

    const newItemDefs = obj!;

    if (typeof onSave === 'string' && onSave === 'default') {
      const resourceNames = newItemDefs.map(newItemDef => newItemDef.metadata.name);
      const clusterName = getCluster() || '';

      dispatch(
        clusterAction(() => applyFunc(newItemDefs, clusterName), {
          startMessage: t('translation|Applying {{ newItemName }}…', {
            newItemName: resourceNames.join(','),
          }),
          cancelledMessage: t('translation|Cancelled applying {{ newItemName }}.', {
            newItemName: resourceNames.join(','),
          }),
          successMessage: t('translation|Applied {{ newItemName }}.', {
            newItemName: resourceNames.join(','),
          }),
          errorMessage: t('translation|Failed to apply {{ newItemName }}.', {
            newItemName: resourceNames.join(','),
          }),
          cancelUrl: location.pathname,
        })
      );

      dispatchCreateEvent({
        status: EventStatus.CONFIRMED,
      });

      onClose();
    } else if (typeof onSave === 'function') {
      onSave!(obj);
    }
  }

  function makeEditor() {
    // @todo: monaco editor does not support pt, ta, hi amongst various other langs.
    if (['de', 'es', 'fr', 'it', 'ja', 'ko', 'ru', 'zh-cn', 'zh-tw'].includes(lang)) {
      loader.config({ 'vs/nls': { availableLanguages: { '*': lang } }, monaco });
    } else {
      loader.config({ monaco });
    }

    return useSimpleEditor ? (
      <Box height="100%">
        <SimpleEditor
          language={originalCodeRef.current.format || 'yaml'}
          value={code.code}
          onChange={onChange}
        />
      </Box>
    ) : (
      <Box height="100%">
        <Editor
          language={originalCodeRef.current.format || 'yaml'}
          theme={theme.base === 'dark' ? 'vs-dark' : 'light'}
          value={code.code}
          options={editorOptions}
          onChange={onChange}
          height="100%"
        />
      </Box>
    );
  }

  const errorLabel = error || errorMessage;
  let dialogTitle = title;
  if (!dialogTitle && item) {
    const itemName = (isKubeObjectIsh(item) && item.metadata?.name) || t('New Object');
    dialogTitle = isReadOnly()
      ? t('translation|View: {{ itemName }}', { itemName })
      : t('translation|Edit: {{ itemName }}', { itemName });
  }

  const dialogTitleId = useId('editor-dialog-title-');

  const content = !item ? (
    <Loader title={t('Loading editor')} />
  ) : (
    <React.Fragment>
      {uploadYaml ? <UploadYourYaml setUploadYaml={setUploadYaml} setCode={setCode} /> : ''}
      <DialogContent
        sx={{
          height: '80%',
          overflowY: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box py={1}>
          <Grid container spacing={2} justifyContent="space-between">
            {
              actions.length > 0 ? (
                actions.map((action, i) => (
                  <Grid item key={`editor_action_${i}`}>
                    {action}
                  </Grid>
                ))
              ) : (
                <Grid item></Grid>
              ) // Just to keep the layout consistent.
            }
            <Grid item>
              <FormGroup row>
                {allowToHideManagedFields && (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={hideManagedFields}
                        onChange={() => setHideManagedFields(() => !hideManagedFields)}
                        name="hideManagedFields"
                      />
                    }
                    label={t('Hide Managed Fields')}
                  />
                )}
                <FormControlLabel
                  control={
                    <Switch
                      checked={useSimpleEditor}
                      onChange={() => setUseSimpleEditor(() => !useSimpleEditor)}
                      name="useSimpleEditor"
                    />
                  }
                  label={t('Use minimal editor')}
                />
              </FormGroup>
            </Grid>
            <Box
              sx={theme => ({
                bgcolor: theme.palette.mode === 'dark' ? '#1c1c1c' : '#f5f5f5',
                borderRadius: '8px',
                width: '100%',
                m: 2,
                py: 1,
                px: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              })}
            >
              <Icon icon="mdi:arrow-up" width="24" />
              <Icon icon="mdi:arrow-down" width="24" />
              <Box sx={{ flex: 1 }}></Box>
              <Button
                onClick={() => {
                  setUploadYaml(!uploadYaml);
                }}
                variant="outlined"
                component="label"
              >
                {t('translation | Upload File/Url')}
              </Button>
            </Box>
          </Grid>
        </Box>
        {isReadOnly() ? (
          makeEditor()
        ) : (
          <Tabs
            onTabChanged={handleTabChange}
            ariaLabel={t('translation|Editor')}
            tabs={[
              {
                label: t('translation|Editor'),
                component: makeEditor(),
              },
              {
                label: t('translation|Documentation'),
                component: (
                  <Box sx={{ height: '100%', overflowY: 'auto' }}>
                    <DocsViewer docSpecs={docSpecs} />
                  </Box>
                ),
              },
            ]}
          />
        )}
      </DialogContent>
      <DialogActions>
        {!isReadOnly() && (
          <ConfirmButton
            disabled={originalCodeRef.current.code === code.code}
            color="secondary"
            variant="contained"
            aria-label={t('translation|Undo')}
            onConfirm={onUndo}
            confirmTitle={t('translation|Are you sure?')}
            confirmDescription={t(
              'This will discard your changes in the editor. Do you want to proceed?'
            )}
            // @todo: aria-controls should point to the textarea id
          >
            {t('translation|Undo Changes')}
          </ConfirmButton>
        )}
        <div style={{ flex: '1 0 0' }} />
        {errorLabel && <Typography color="error">{errorLabel}</Typography>}
        <div style={{ flex: '1 0 0' }} />
        <Button onClick={onClose} color="secondary" variant="contained">
          {t('translation|Close')}
        </Button>
        {!isReadOnly() && (
          <Button
            onClick={handleSave}
            color="primary"
            variant="contained"
            disabled={originalCodeRef.current.code === code.code || !!error}
            // @todo: aria-controls should point to the textarea id
          >
            {saveLabel || t('translation|Save & Apply')}
          </Button>
        )}
      </DialogActions>
    </React.Fragment>
  );

  if (!other.open && !other.keepMounted) {
    return null;
  }

  if (other.noDialog) {
    return content;
  }

  return (
    <Dialog
      title={dialogTitle}
      aria-busy={!item}
      maxWidth="lg"
      scroll="paper"
      fullWidth
      withFullScreen
      onClose={onClose}
      {...other}
      aria-labelledby={dialogTitleId}
      titleProps={{
        id: dialogTitleId,
      }}
    >
      {content}
    </Dialog>
  );
}

export function ViewDialog(props: Omit<EditorDialogProps, 'onSave'>) {
  return <EditorDialog {...props} onSave={null} />;
}

interface UploadYamlProps {
  setUploadYaml: (value: boolean) => void;
  setCode: React.Dispatch<React.SetStateAction<{ code: string; format: string }>>;
}

function UploadYourYaml(props: UploadYamlProps) {
  const { setUploadYaml, setCode } = props;
  const { t } = useTranslation();
  const [uploadedfile, setUploadedFile] = React.useState<File | null>(null);

  const Uploadyamlfromfilesystem = () => {
    const [dragOver, setDragOver] = React.useState(false);

    const handleLoadFile = () => {
      if (!uploadedfile) return;

      const reader = new FileReader();
      reader.onload = e => {
        const text = e.target?.result as string;

        setCode({ format: 'yaml', code: text });

        setUploadYaml(false);
      };
      reader.readAsText(uploadedfile);
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      console.log('Dropped files:', files[0]);
      setUploadedFile(files[0] || null);
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    };

    const handleDragLeave = () => setDragOver(false);

    return (
      <>
        <Box
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          sx={theme => ({
            position: 'relative',
            borderRadius: 2,
            p: 4,
            textAlign: 'center',
            border: '2px dashed',
            borderColor: dragOver
              ? 'primary.main'
              : theme.palette.mode === 'dark'
              ? 'grey.300'
              : 'grey.800',
            bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.300',
            cursor: 'pointer',
            transition: '0.2s',
          })}
        >
          <input
            type="file"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              cursor: 'pointer',
            }}
            onChange={e => setUploadedFile(e.target.files?.[0] || null)}
          />

          <Icon icon="mdi:upload" width="40" color="white" />
          <Typography sx={{ m: 2 }}>
            {dragOver
              ? t('translation|Drop the file here...')
              : t('translation|Select a file or drag and drop here')}
          </Typography>
          <Box
            sx={{
              p: 1,
              bgcolor: 'yellow',
              borderRadius: 1,
              color: 'black',
              fontWeight: 'bold',
              '&:hover': { bgcolor: '#e6d600' },
            }}
            component="span"
          >
            {t('translation | Select File')}
          </Box>
        </Box>

        {uploadedfile && (
          <Box
            sx={theme => ({
              bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.300',
              color: theme.palette.mode === 'dark' ? 'grey.300' : 'grey.800',
              borderRadius: 1,
              mt: 2,
              p: 1,
              width: '100%',
              border: '1px',
              fontWeight: 'bold',
            })}
          >
            {uploadedfile.name}
          </Box>
        )}
        <Box sx={{ display: 'flex', mt: 2, justifyContent: 'space-between' }}>
          <Button
            variant="outlined"
            sx={{ borderColor: 'grey.500', px: 2 }}
            onClick={() => setUploadYaml(false)}
          >
            <Icon
              icon="mdi:arrow-left"
              width="18"
              height="18"
              style={{ display: 'inline-block', marginRight: '8px' }}
            />
            {t('translation|Back')}
          </Button>
          <Button
            onClick={handleLoadFile}
            variant="contained"
            sx={{
              bgcolor: 'grey.700',
              color: 'white',
              px: 5,
              '&:hover': { bgcolor: 'grey.600' },
            }}
          >
            {t('translation|Load')}
          </Button>
        </Box>
      </>
    );
  };

  const UploadyamlfromUrl = () => {
    const [url, setUrl] = React.useState('');

    const loadFileFromUrl = async () => {
      if (!url) return;
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        }
        const text = await response.text();
        setCode({ format: 'yaml', code: text });
        setUploadYaml(false);
      } catch (error) {
        console.error('Error loading file from URL:', error);
      }
    };

    return (
      <>
        <Box>
          <TextField
            fullWidth
            variant="outlined"
            onChange={e => setUrl(e.target.value)}
            placeholder={t('translation | Paste URL')}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Icon icon="mdi:link-variant" width="20" color="grey" />
                </InputAdornment>
              ),
              sx: theme => ({
                bgcolor: theme.palette.mode === 'dark' ? '#1c1c1c' : '#f5f5f5',
                color: theme.palette.mode === 'dark' ? '#f5f5f5' : '#1c1c1c',
                borderRadius: 1,
              }),
            }}
          />
        </Box>
        <Box sx={{ display: 'flex', mt: 2, justifyContent: 'space-between' }}>
          <Button
            variant="outlined"
            sx={{ borderColor: 'grey.500', px: 2 }}
            onClick={() => setUploadYaml(false)}
          >
            <Icon
              icon="mdi:arrow-left"
              width="18"
              height="18"
              style={{ display: 'inline-block', marginRight: '8px' }}
            />
            {t('translation|Back')}
          </Button>
          <Button
            onClick={loadFileFromUrl}
            variant="contained"
            sx={{
              bgcolor: 'grey.700',
              color: 'white',
              px: 5,
              '&:hover': { bgcolor: 'grey.600' },
            }}
          >
            {t('translation|Load')}
          </Button>
        </Box>
      </>
    );
  };

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 6,
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        bgcolor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <Box
        sx={theme => ({
          bgcolor: theme.palette.mode === 'dark' ? '#1c1c1c' : '#f5f5f5',
          p: 3,
          width: 600,
          borderRadius: 1,
          boxShadow: 4,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        })}
      >
        <Tabs
          ariaLabel={t('translation|Upload File/URL')}
          tabs={[
            { label: t('translation|Upload File'), component: <Uploadyamlfromfilesystem /> },
            { label: t('translation|Load from URL'), component: <UploadyamlfromUrl /> },
          ]}
        />
      </Box>
    </Box>
  );
}

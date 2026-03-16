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

import { Icon, InlineIcon } from '@iconify/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { DropZoneBox } from '../DropZoneBox';
import Tabs from '../Tabs';

const ActionButtons = ({
  onBack,
  onLoad,
  disabled,
}: {
  onBack: () => void;
  onLoad: () => void;
  disabled?: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <Box sx={{ display: 'flex', mt: 2, justifyContent: 'space-between' }}>
      <Button onClick={onBack} color="inherit" variant="outlined">
        <Icon
          icon="mdi:arrow-left"
          width="18"
          height="18"
          style={{ display: 'inline-block', marginRight: '8px' }}
        />
        {t('translation|Back')}
      </Button>
      <Button onClick={onLoad} color="inherit" variant="contained" disabled={disabled}>
        {t('translation|Load')}
      </Button>
    </Box>
  );
};

interface UploadDialogProps {
  setUploadFiles: (value: boolean) => void;
  setCode: React.Dispatch<React.SetStateAction<{ code: string; format: string }>>;
}

const UploadFromFilesystem = ({
  onLoaded,
  onCancel,
}: {
  onLoaded: (text: string) => void;
  onCancel: () => void;
}) => {
  const { t } = useTranslation();
  const [files, setFiles] = React.useState<File[]>([]);
  const [dragOver, setDragOver] = React.useState(false);
  const [error, setError] = React.useState('');

  const onFilesPicked = (picked: FileList | null) => {
    setError('');
    setFiles(picked ? Array.from(picked) : []);
  };

  const readFileAsText = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(String(e.target?.result ?? ''));
      reader.onerror = () => reject(new Error(t('translation|Failed to read file.')));
      reader.onabort = () => reject(new Error(t('translation|File read was aborted.')));
      reader.readAsText(file);
    });

  const handleLoadFiles = async () => {
    try {
      setError('');
      if (files.every(f => f.size === 0)) {
        setError(t('translation|Error: All of the files are empty.'));
      }

      const texts = await Promise.all(files.map(readFileAsText));
      const merged = texts.join('---\n');
      onLoaded(merged);
    } catch (e) {
      setError((e as Error).message || t('translation|Unexpected error while reading files.'));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    onFilesPicked(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  return (
    <>
      <DropZoneBox onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
        <Typography sx={{ m: 2 }}>
          {dragOver
            ? t('translation|Drop the file here...')
            : t('translation|Select a file or drag and drop here')}
        </Typography>
        <Button
          variant="contained"
          component="label"
          startIcon={<InlineIcon icon="mdi:upload" width={32} />}
          sx={{ fontWeight: 500 }}
        >
          {t('translation|Select File')}
          <input
            type="file"
            accept=".yaml,.yml,application/yaml"
            multiple
            hidden
            onChange={e => onFilesPicked(e.target.files)}
          />
        </Button>
      </DropZoneBox>
      {!!files.length && (
        <Box
          sx={{
            borderRadius: 1,
            mt: 2,
            p: 1,
            width: '100%',
            border: '1px',
            fontWeight: 'bold',
          }}
        >
          {files.length === 1
            ? files[0].name
            : t('translation|{{count}} files selected', { count: files.length })}{' '}
          {files.length > 1 && (
            <Typography variant="body2" component="div" sx={{ mt: 1 }}>
              {files.map(f => f.name).join(', ')}
            </Typography>
          )}
        </Box>
      )}
      {error && (
        <Typography sx={{ mt: 1 }} color="error">
          {error}
        </Typography>
      )}
      <ActionButtons onBack={onCancel} onLoad={handleLoadFiles} disabled={!files.length} />
    </>
  );
};

const UploadFromUrl = ({
  onLoaded,
  onCancel,
}: {
  onLoaded: (text: string) => void;
  onCancel: () => void;
}) => {
  const { t } = useTranslation();
  const [url, setUrl] = React.useState('');
  const [error, setError] = React.useState('');

  const parseUrl = (raw: string) => {
    try {
      const u = new URL(raw.trim());
      return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
    } catch {
      return null;
    }
  };

  const loadFromUrl = async () => {
    setError('');
    const u = parseUrl(url);
    if (!u) {
      setError(t('translation|Please enter a valid URL.'));
      return;
    }

    try {
      const res = await fetch(u.toString());
      if (!res.ok) {
        setError(t(`translation|Failed to fetch file: ${res.statusText}`));
      }
      const text = await res.text();
      onLoaded(text);
    } catch (e) {
      setError((e as Error).message || t('translation|Unexpected error while fetching the file.'));
    }
  };

  return (
    <>
      <Box sx={{ pt: 1 }}>
        <TextField
          label={t('translation|Enter URL')}
          variant="outlined"
          fullWidth
          value={url}
          onChange={e => {
            setUrl(e.target.value);
            setError('');
          }}
          sx={{ mb: 2 }}
          error={!!error}
        />
      </Box>
      {error && (
        <Typography sx={{ mt: 1 }} color="error">
          {error}
        </Typography>
      )}
      <ActionButtons onBack={onCancel} onLoad={loadFromUrl} disabled={!url} />
    </>
  );
};

export function UploadDialog(props: UploadDialogProps) {
  const { setUploadFiles, setCode } = props;
  const { t } = useTranslation();

  const finishLoad = (text: string) => {
    setCode({ format: 'yaml', code: text });
    setUploadFiles(false);
  };

  return (
    <Dialog
      open
      onClose={() => setUploadFiles(false)}
      fullWidth
      slotProps={{
        backdrop: { sx: { backdropFilter: 'blur(2px)' } },
      }}
    >
      <DialogContent sx={{ pt: 1 }}>
        <Tabs
          ariaLabel={t('translation|Upload File/URL')}
          tabs={[
            {
              label: t('translation|Upload File'),
              component: (
                <Box pt={2}>
                  <UploadFromFilesystem
                    onLoaded={finishLoad}
                    onCancel={() => setUploadFiles(false)}
                  />
                </Box>
              ),
            },
            {
              label: t('translation|Load from URL'),
              component: (
                <Box pt={2}>
                  <UploadFromUrl onLoaded={finishLoad} onCancel={() => setUploadFiles(false)} />
                </Box>
              ),
            },
          ]}
        />
      </DialogContent>
    </Dialog>
  );
}

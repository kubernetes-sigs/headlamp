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
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useSnackbar } from 'notistack';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getDefaultContainer } from '../../helpers/podContainer';
import Pod from '../../lib/k8s/pod';
import { copyFromPod, copyToPod, PodCopyErrorCode } from '../../lib/k8s/podCopy';
import { Dialog } from '../common/Dialog';

interface PodCopyDialogProps {
  open: boolean;
  onClose: () => void;
  pod: Pod;
}

/** Trigger a browser download of a Blob with the given filename */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function PodCopyDialog({ open, onClose, pod }: PodCopyDialogProps) {
  const { t } = useTranslation('translation');
  const { enqueueSnackbar } = useSnackbar();
  const [tab, setTab] = useState(0);
  const [container, setContainer] = useState(() => getDefaultContainer(pod));
  const [downloadPath, setDownloadPath] = useState('');
  const [uploadPath, setUploadPath] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedFolderName, setSelectedFolderName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const containers = pod?.spec?.containers?.map(c => c.name) ?? [];

  const handleDownload = async () => {
    const path = downloadPath.trim();
    if (!path) {
      enqueueSnackbar(t('translation|Enter a path in the container'), { variant: 'warning' });
      return;
    }
    setLoading(true);
    try {
      const blob = await copyFromPod(pod, container, path);
      const suggestedName = path.split('/').pop() || 'archive';
      const name = suggestedName.endsWith('.tar') ? suggestedName : `${suggestedName}.tar`;
      downloadBlob(blob, name);
      enqueueSnackbar(t('translation|Download started'), { variant: 'success' });
      onClose();
    } catch (err) {
      const code = (err as Error & { code?: string })?.code;
      const message =
        code === PodCopyErrorCode.PATH_NOT_FOUND
          ? t('translation|The path does not exist in the container.')
          : err instanceof Error
          ? err.message
          : String(err);
      enqueueSnackbar(t('translation|Download failed: {{message}}', { message }), {
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    const path = uploadPath.trim();
    if (!path) {
      enqueueSnackbar(t('translation|Enter destination path in the container'), {
        variant: 'warning',
      });
      return;
    }
    if (selectedFiles.length === 0) {
      enqueueSnackbar(t('translation|Select at least one file'), { variant: 'warning' });
      return;
    }
    setLoading(true);
    try {
      await copyToPod(pod, container, path, selectedFiles);
      setSelectedFiles([]);
      setSelectedFolderName(null);
      enqueueSnackbar(t('translation|Upload completed'), { variant: 'success' });
      onClose();
    } catch (err) {
      const code = (err as Error & { code?: string })?.code;
      const message =
        code === PodCopyErrorCode.DEST_DIR_MUST_EXIST
          ? t('translation|The destination directory must exist (e.g. /tmp).')
          : err instanceof Error
          ? err.message
          : String(err);
      enqueueSnackbar(t('translation|Upload failed: {{message}}', { message }), {
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setSelectedFiles(Array.from(files));
      setSelectedFolderName(null);
    }
    e.target.value = '';
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFiles(Array.from(files));
      const firstPath = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath;
      setSelectedFolderName(firstPath ? firstPath.split('/')[0] : (files[0] as File).name);
    }
    e.target.value = '';
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('translation|Copy files')}
      maxWidth="sm"
      fullWidth
    >
      <Box sx={{ px: 3, pb: 3, pt: 1 }}>
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>{t('translation|Container')}</InputLabel>
          <Select
            value={container}
            label={t('translation|Container')}
            onChange={e => setContainer(e.target.value)}
          >
            {containers.map(name => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label={t('translation|Download from container')} />
          <Tab label={t('translation|Upload to container')} />
        </Tabs>

        {tab === 0 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t('translation|Download a file or directory from the container as a tar archive.')}
            </Typography>
            <TextField
              fullWidth
              size="small"
              label={t('translation|Path in container')}
              placeholder={t('translation|/tmp/myfile or /var/log')}
              value={downloadPath}
              onChange={e => setDownloadPath(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              startIcon={<Icon icon="mdi:download" />}
              onClick={handleDownload}
              disabled={loading}
            >
              {loading ? t('translation|Downloading…') : t('translation|Download')}
            </Button>
          </Box>
        )}

        {tab === 1 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t('translation|Upload files or a folder.')}
            </Typography>
            <TextField
              fullWidth
              size="small"
              label={t('translation|Destination path in container')}
              placeholder={t('translation|/tmp')}
              helperText={t('translation|Directory must exist. File(s) will be written here.')}
              value={uploadPath}
              onChange={e => setUploadPath(e.target.value)}
              sx={{ mb: 2 }}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <input
              ref={folderInputRef}
              type="file"
              {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
              style={{ display: 'none' }}
              onChange={handleFolderChange}
            />
            <Box sx={{ mb: 2 }}>
              <Button
                variant="outlined"
                startIcon={<Icon icon="mdi:file-upload" />}
                onClick={() => fileInputRef.current?.click()}
                sx={{ mr: 1 }}
              >
                {t('translation|Choose files')}
              </Button>
              <Button
                variant="outlined"
                startIcon={<Icon icon="mdi:folder-upload" />}
                onClick={() => folderInputRef.current?.click()}
              >
                {t('translation|Choose folder')}
              </Button>
              {selectedFiles.length > 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {selectedFolderName
                    ? t('translation|Folder "{{name}}" ({{count}} file(s))', {
                        name: selectedFolderName,
                        count: selectedFiles.length,
                      })
                    : t('translation|{{count}} file(s) selected', {
                        count: selectedFiles.length,
                      })}
                </Typography>
              )}
            </Box>
            <Button
              variant="contained"
              startIcon={<Icon icon="mdi:upload" />}
              onClick={handleUpload}
              disabled={loading || selectedFiles.length === 0}
            >
              {loading ? t('translation|Uploading…') : t('translation|Upload')}
            </Button>
          </Box>
        )}
      </Box>
    </Dialog>
  );
}

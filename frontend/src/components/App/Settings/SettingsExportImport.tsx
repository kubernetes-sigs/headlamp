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
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { useSnackbar } from 'notistack';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { exportConfigurationToFile, importSettings } from '../../../helpers/settingsExportImport';
import SectionBox from '../../common/SectionBox';

export default function SettingsExportImport() {
  const { t } = useTranslation(['translation']);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [openModal, setOpenModal] = useState(false);
  const [importContent, setImportContent] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const { enqueueSnackbar } = useSnackbar();

  const handleExport = () => {
    exportConfigurationToFile();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      const content = e.target?.result as string;
      setImportContent(content);
      setImportError(null);
      setOpenModal(true);
    };
    reader.onerror = () => {
      enqueueSnackbar(t('translation|Failed to read the file.'), { variant: 'error' });
    };
    reader.readAsText(file);
    // Reset the input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = () => {
    if (importContent === null) return;

    let settings;
    try {
      settings = JSON.parse(importContent);
    } catch (e) {
      setImportError(t('translation|Failed to parse the configuration file. It may be corrupted.'));
      return;
    }

    try {
      const success = importSettings(settings);

      if (success) {
        // Trigger a page reload to ensure all state is re-hydrated from localStorage
        window.location.reload();
      } else {
        setImportError(t('translation|Invalid configuration file format.'));
      }
    } catch (e) {
      setImportError(
        t(
          'translation|Failed to save configuration to local storage. Check your browser storage quota.'
        )
      );
    }
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setImportContent(null);
    setImportError(null);
  };

  return (
    <Box sx={{ mt: 4 }}>
      <SectionBox
        title={t('translation|Export / Import Configuration')}
        headerProps={{
          headerStyle: 'subsection',
        }}
      >
        <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
          {t(
            'translation|Export your current settings (including themes, tables, clusters, and shortcuts) to a file, or import an existing configuration.'
          )}
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <Button variant="outlined" onClick={handleExport} color="primary">
            {t('translation|Export Configuration')}
          </Button>

          <Button variant="outlined" onClick={() => fileInputRef.current?.click()} color="primary">
            {t('translation|Import Configuration')}
          </Button>
          <input
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleFileChange}
          />
        </Box>
      </SectionBox>

      <Dialog open={openModal} onClose={handleCloseModal}>
        <DialogTitle>{t('translation|Confirm Import')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t(
              'translation|Importing a configuration will overwrite your existing local settings. Are you sure you want to proceed?'
            )}
          </DialogContentText>
          {importError && (
            <Typography color="error" sx={{ mt: 2 }}>
              {importError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseModal} color="primary">
            {t('translation|Cancel')}
          </Button>
          <Button onClick={handleConfirmImport} color="error" variant="contained">
            {t('translation|Import and Reload')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

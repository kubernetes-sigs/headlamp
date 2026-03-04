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

import Editor from '@monaco-editor/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import * as yaml from 'js-yaml';
import _ from 'lodash';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KubeObjectInterface } from '../../../lib/k8s/KubeObject';
import { useCurrentAppTheme } from '../../App/themeSlice';
import { Dialog } from '../Dialog';

interface DryRunPreviewDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** The dry-run result object to display */
  item: KubeObjectInterface;
  /** Dialog title */
  title: string;
  /** Called when the dialog is closed */
  onClose: () => void;
}

/**
 * A read-only YAML preview dialog for dry-run results.
 *
 * Displays the full Kubernetes resource as YAML in a Monaco editor,
 * using Headlamp's Dialog component with fullscreen support.
 * Includes a toggle to hide managed fields for cleaner viewing.
 */
export default function DryRunPreviewDialog(props: DryRunPreviewDialogProps) {
  const { open, item, title, onClose } = props;
  const { t } = useTranslation(['translation']);
  const theme = useCurrentAppTheme();
  const [hideManagedFields, setHideManagedFields] = useState(true);

  const yamlContent = useMemo(() => {
    const cloned = _.cloneDeep(item);
    if (hideManagedFields && cloned?.metadata?.managedFields) {
      delete cloned.metadata.managedFields;
    }
    return yaml.dump(cloned);
  }, [item, hideManagedFields]);

  if (!open) {
    return null;
  }

  return (
    <Dialog open={open} onClose={onClose} title={title} withFullScreen>
      <DialogContent
        sx={{
          height: '80vh',
          overflowY: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box py={1} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <FormControlLabel
            control={
              <Switch
                checked={hideManagedFields}
                onChange={() => setHideManagedFields(prev => !prev)}
                name="hideManagedFields"
              />
            }
            label={t('translation|Hide managed fields')}
          />
        </Box>
        <Box sx={{ flexGrow: 1 }}>
          <Editor
            language="yaml"
            theme={theme.base === 'dark' ? 'vs-dark' : 'light'}
            value={yamlContent}
            options={{
              readOnly: true,
              selectOnLineNumbers: true,
              automaticLayout: true,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
            }}
            height="100%"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="secondary" variant="contained">
          {t('translation|Close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

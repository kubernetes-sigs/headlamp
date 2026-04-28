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
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { alpha } from '@mui/system';
import * as yaml from 'js-yaml';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSelectedClusters } from '../../../lib/k8s';
import Pod from '../../../lib/k8s/pod';
import { Activity } from '../../activity/Activity';
import CreatePodForm from '../../pod/CreatePodForm';
import ActionButton from '../ActionButton';
import EditorDialog from './EditorDialog';

export const RESOURCE_DEFINITIONS = {
  Pod: { class: Pod, form: CreatePodForm },
};

export type ResourceType = keyof typeof RESOURCE_DEFINITIONS;

/** Parse a YAML string into a plain object. Returns `null` for non-empty
 *  invalid input so the form state is not overwritten mid-edit. Blank input
 *  yields `{}`. Used by {@link CreateActivityContent} to sync the form when
 *  the user edits YAML directly in the editor panel. */
export function parseEditorObject(input: string): Record<string, any> | null {
  if (!input.trim()) return {};

  try {
    const parsed = yaml.load(input);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, any>;
    }
  } catch {
    // Ignore parse errors while editing incomplete YAML.
  }

  return null;
}

/** Inner component rendered inside the Activity panel. Holds shared state so the
 *  form can update the editor YAML in-place without relaunching the activity. */
function CreateActivityContent(props: { onClose: () => void }) {
  const { onClose } = props;
  const { t } = useTranslation(['translation', 'glossary']);
  const clusters = useSelectedClusters();

  const [item, setItem] = React.useState<any>({});
  const [formResource, setFormResource] = React.useState<Record<string, any>>({});
  const [errorMessage, setErrorMessage] = React.useState('');
  const [selectedResource, setSelectedResource] = React.useState<ResourceType | undefined>();
  const [targetCluster, setTargetCluster] = React.useState(clusters[0] || '');

  function handleResourceChange(resource: ResourceType | undefined) {
    setSelectedResource(resource);
    if (resource && resource in RESOURCE_DEFINITIONS) {
      const baseObject = RESOURCE_DEFINITIONS[resource].class.getBaseObject();
      setItem(baseObject);
      setFormResource(baseObject);
    }
  }

  React.useEffect(() => {
    if (clusters.length === 0) {
      setTargetCluster('');
    } else if (!clusters.includes(targetCluster)) {
      setTargetCluster(clusters[0]);
    }
  }, [clusters, targetCluster]);

  /** Called by the resource form (e.g. CreatePodForm) when the user edits a
   *  field. Updates both the form state and the editor YAML via `item`. */
  const handleFormChange = (newItem: Record<string, any>) => {
    setFormResource(newItem);
    setItem(newItem);
  };

  /** Called by EditorDialog when the user edits YAML directly. Parses the
   *  text and syncs it back into the form; skips the update on invalid YAML
   *  so incomplete edits don't wipe the form state. */
  const handleEditorChanged = (newValue: string) => {
    setErrorMessage('');
    const parsed = parseEditorObject(newValue);
    if (parsed !== null) {
      setFormResource(parsed);
    }
  };

  /** Renders the resource-type picker and, once a type is selected, the
   *  corresponding form component. Passed to EditorDialog as `formContent`. */
  function renderFormContent() {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          pt: 2,
          px: 2,
          height: '100%',
          overflowY: 'auto',
        }}
      >
        <FormControl
          sx={{
            alignSelf: 'start',
            width: '80%',
            maxWidth: 480,
            marginLeft: 5,
          }}
        >
          <InputLabel id="resource-picker-label">{t('translation|Resource Type')}</InputLabel>
          <Select
            labelId="resource-picker-label"
            value={selectedResource ?? ''}
            label={t('translation|Resource Type')}
            onChange={e => handleResourceChange(e.target.value as ResourceType)}
          >
            {(Object.keys(RESOURCE_DEFINITIONS) as ResourceType[]).map(rt => (
              <MenuItem key={rt} value={rt}>
                {rt}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {selectedResource &&
          (() => {
            const FormComponent = RESOURCE_DEFINITIONS[selectedResource].form;
            return <FormComponent resource={formResource} onChange={handleFormChange} />;
          })()}
      </Box>
    );
  }

  return (
    <EditorDialog
      item={item}
      open
      noDialog
      onClose={onClose}
      setOpen={() => {}}
      saveLabel={t('translation|Apply')}
      errorMessage={errorMessage}
      onEditorChanged={handleEditorChanged}
      treatItemChangesAsEdits
      title={t('translation|Create / Apply')}
      cluster={targetCluster}
      formContent={renderFormContent()}
      actions={
        clusters.length > 1
          ? [
              <FormControl key="cluster-select">
                <InputLabel id="edit-dialog-cluster-target">{t('glossary|Cluster')}</InputLabel>
                <Select
                  labelId="edit-dialog-cluster-target"
                  id="edit-dialog-cluster-target-select"
                  value={targetCluster}
                  onChange={event => {
                    setTargetCluster(event.target.value as string);
                  }}
                >
                  {clusters.map(cluster => (
                    <MenuItem key={cluster} value={cluster}>
                      {cluster}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>,
            ]
          : []
      }
    />
  );
}

interface CreateButtonProps {
  isNarrow?: boolean;
}

export default function CreateButton(props: CreateButtonProps) {
  const { isNarrow } = props;
  const { t } = useTranslation(['translation']);

  const openActivity = () => {
    const id = 'create-button';
    Activity.launch({
      id: id,
      title: t('translation|Create / Apply'),
      icon: <Icon icon="mdi:pencil" />,
      content: <CreateActivityContent onClose={() => Activity.close(id)} />,
      location: 'full',
    });
  };

  return (
    <React.Fragment>
      {isNarrow ? (
        <ActionButton
          description={t('translation|Create / Apply')}
          onClick={openActivity}
          icon="mdi:plus-box"
          width="48"
          iconButtonProps={{
            color: 'primary',
            sx: theme => ({
              color: theme.palette.sidebar.color,
            }),
          }}
        />
      ) : (
        <Button
          onClick={openActivity}
          startIcon={<InlineIcon icon="mdi:plus" />}
          color="secondary"
          size="large"
          sx={theme => ({
            background: theme.palette.sidebar.actionBackground,
            color: theme.palette.getContrastText(theme.palette.sidebar.actionBackground),
            ':hover': {
              background: alpha(theme.palette.sidebar.actionBackground, 0.6),
            },
          })}
        >
          {t('translation|Create')}
        </Button>
      )}
    </React.Fragment>
  );
}

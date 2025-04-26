import React from 'react';
import { useTranslation } from 'react-i18next';
import { KubeObjectClass } from '../../lib/k8s/cluster';
import { ActionButton, AuthVisible, EditorDialog } from '../common';

export interface CreateResourceButtonProps {
  resourceClass: KubeObjectClass;
  resourceName?: string;
}

export function CreateResourceButton(props: CreateResourceButtonProps) {
  const { resourceClass, resourceName } = props;
  const { t } = useTranslation(['glossary', 'translation']);
  const [openDialog, setOpenDialog] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');

  const baseObject = resourceClass.getBaseObject();
  const name = resourceName ?? baseObject.kind;

  return (
    <AuthVisible item={resourceClass} authVerb="create">
      <ActionButton
        color="primary"
        description={t('translation|Create {{ name }}', { name })}
        icon={'mdi:plus-circle'}
        onClick={() => {
          setOpenDialog(true);
        }}
      />
      <EditorDialog
        item={baseObject}
        open={openDialog}
        setOpen={setOpenDialog}
        onClose={() => setOpenDialog(false)}
        saveLabel={t('translation|Apply')}
        errorMessage={errorMessage}
        onEditorChanged={() => setErrorMessage('')}
        title={t('translation|Create {{ name }}', { name })}
        aria-label={t('translation|Create {{ name }}', { name })}
      />
    </AuthVisible>
  );
}

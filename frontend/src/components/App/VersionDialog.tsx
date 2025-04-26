import { DialogContent } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { getProductName, getVersion } from '../../helpers/getProductInfo';
import { setVersionDialogOpen } from '../../redux/actions/actions';
import { useTypedSelector } from '../../redux/reducers/reducers';
import { Dialog, NameValueTable } from '../common';

export default function VersionDialog(props: {
  getVersion?: () => {
    VERSION: any;
    GIT_VERSION: any;
  };
}) {
  const open = useTypedSelector(state => state.ui.isVersionDialogOpen);
  const dispatch = useDispatch();
  const { t } = useTranslation(['glossary', 'translation']);
  const { VERSION, GIT_VERSION } = props.getVersion ? props.getVersion() : getVersion();

  return (
    <Dialog
      maxWidth="sm"
      open={open}
      onClose={() => dispatch(setVersionDialogOpen(false))}
      title={getProductName()}
      // We want the dialog to show on top of the cluster chooser one if needed
      style={{ zIndex: 1900 }}
    >
      <DialogContent>
        <NameValueTable
          rows={[
            {
              name: t('translation|Version'),
              value: VERSION,
            },
            {
              name: t('Git Commit'),
              value: GIT_VERSION,
            },
          ]}
        />
      </DialogContent>
    </Dialog>
  );
}

import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { createRouteURL } from '../../../lib/router';
import { getCluster } from '../../../lib/util';
import { ActionButton } from '../../common';

export default function SettingsButton(props: { onClickExtra?: () => void }) {
  const { onClickExtra } = props;
  const { t } = useTranslation(['glossary', 'translation']);
  const history = useHistory();
  const clusterName = getCluster();

  if (clusterName === null) {
    return null;
  }

  return (
    <ActionButton
      icon="mdi:cog"
      description={t('translation|Settings')}
      iconButtonProps={{
        color: 'inherit',
      }}
      onClick={() => {
        history.push(createRouteURL('settingsCluster', { cluster: clusterName }));
        onClickExtra && onClickExtra();
      }}
    />
  );
}

import { Alert, AlertTitle, Box, Button } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelectedClusters } from '../../lib/k8s';
import { ApiError } from '../../lib/k8s/api/v2/ApiError';

export interface ClusterGroupErrorMessageProps {
  /**
   * Array of errors
   */
  errors?: ApiError[] | null;
}

export function ClusterGroupErrorMessage({ errors }: ClusterGroupErrorMessageProps) {
  if (!errors || errors?.length === 0) {
    return null;
  }

  return errors.map((error, i) => <ErrorMessage error={error} key={error.stack ?? i} />);
}

function ErrorMessage({ error }: { error: ApiError }) {
  const { t } = useTranslation();
  const showClusterName = useSelectedClusters().length > 1;
  const [showMessage, setShowMessage] = useState(false);

  const defaultTitle = t('Failed to load resources');
  const forbiddenTitle = t("You don't have permissions to view this resource");
  const notFoundTitile = t('Resource not found');

  const isForbidden = error.status === 403;

  let title = defaultTitle;
  if (error.status === 404) {
    title = notFoundTitile;
  } else if (isForbidden) {
    title = forbiddenTitle;
  }

  const severity = isForbidden ? 'info' : 'warning';

  return (
    <Alert
      severity={severity}
      sx={{ mb: 1 }}
      action={
        <Button
          size="small"
          color={severity}
          onClick={() => setShowMessage(it => !it)}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {showMessage ? t('Hide details') : t('Show details')}
        </Button>
      }
    >
      <AlertTitle sx={{ mb: showMessage ? undefined : 0 }}>{title}</AlertTitle>
      {showMessage && (
        <>
          {showClusterName ? <Box>Cluster: {error.cluster}</Box> : null}
          {error.message}
        </>
      )}
    </Alert>
  );
}

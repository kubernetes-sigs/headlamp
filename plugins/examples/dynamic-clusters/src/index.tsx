import { ApiProxy, Headlamp, registerAppBarAction } from '@kinvolk/headlamp-plugin/lib';
import { Button, Modal, Paper, Stack, TextField, Typography } from '@mui/material';
import * as yaml from 'js-yaml';
import { useEffect, useState } from 'react';

const request = ApiProxy.request;
const modalStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
};

function ClusterCreationButton() {
  const [open, setOpen] = useState(false);
  const [kubeconfig, setKubeconfig] = useState('');
  const [name, setName] = useState('');
  const [server, setServer] = useState('');
  const [isDynamicClusterEnabled, setIsDynamicClusterEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch configuration from the backend when the component mounts
    request('/config', {}, false, false)
      .then((response: any) => {
        setIsDynamicClusterEnabled(response.isDynamicClusterEnabled);
      })
      .catch((error: any) => {
        console.error('Error fetching config:', error);
      });
  }, []);

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const handleSubmit = () => {
    // Reset any previous errors
    setError(null);

    if (isDynamicClusterEnabled) {
      // Check if the kubeconfig is a valid kubeconfig
      const isValidKubeconfig = (base64Kubeconfig: string): string | null => {
        try {
          // Decode the base64-encoded kubeconfig
          const kubeconfig = atob(base64Kubeconfig);

          // Attempt to parse the kubeconfig as YAML
          const kubeconfigObject: any = yaml.load(kubeconfig);

          // Check for required fields in the kubeconfig object
          if (
            kubeconfigObject &&
            kubeconfigObject.apiVersion === 'v1' &&
            kubeconfigObject.kind === 'Config'
          ) {
            return null; // Kubeconfig is valid, no error
          }

          return 'Invalid kubeconfig format: Missing required fields';
        } catch (error) {
          return `Error decoding/parsing kubeconfig: ${error.message}`;
        }
      };

      // Check if the base64-encoded kubeconfig is a valid kubeconfig
      const validationError = isValidKubeconfig(kubeconfig);
      if (validationError) {
        setError(validationError);
        return; // Abort setting the cluster if kubeconfig is not a valid kubeconfig
      }

      // Handle kubeconfig submission
      Headlamp.setCluster({ kubeconfig })
        .then(() => {
          window.location.reload();
        })
        .catch((e: any) => {
          console.error('Error setting cluster', e);
          setError('Error setting cluster. Please check the provided kubeconfig: ' + e.message);
        });
    } else {
      // Handle name and server submission
      Headlamp.setCluster({ name, server })
        .then(() => {
          window.location.reload();
        })
        .catch((e: any) => {
          console.error('Error setting cluster', e);
          setError(
            'Error setting cluster. Please check the provided name and server: ' + e.message
          );
        });
    }

    handleClose();
  };

  return (
    <>
      <Button color="inherit" onClick={handleOpen}>
        New cluster
      </Button>
      <Modal open={open} onClose={handleClose} style={modalStyle}>
        <Paper style={{ padding: '16px', width: '400px' }}>
          <Stack spacing={2}>
            {/* Display the state of isDynamicClusterEnabled */}
            <Typography variant="body2" color="textSecondary">
              Stateless clusters enabled: {isDynamicClusterEnabled.toString()}
            </Typography>
            {isDynamicClusterEnabled ? (
              // Render kubeconfig input when dynamic clusters are enabled
              <TextField
                label="Please paste base64 encoded Kubeconfig"
                multiline
                rows={4}
                fullWidth
                value={kubeconfig}
                onChange={e => setKubeconfig(e.target.value)}
              />
            ) : (
              // Render name and server inputs when dynamic clusters are not enabled
              <>
                <TextField
                  label="Name"
                  fullWidth
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
                <TextField
                  label="Server"
                  fullWidth
                  value={server}
                  onChange={e => setServer(e.target.value)}
                />
              </>
            )}
            <Button color="inherit" onClick={handleSubmit}>
              Submit
            </Button>

            {/* Display error message to the user if an error occurred */}
            {error && (
              <Typography variant="body2" color="error">
                {error}
              </Typography>
            )}
          </Stack>
        </Paper>
      </Modal>
    </>
  );
}

registerAppBarAction(ClusterCreationButton);

import Button from '@mui/material/Button';
import { SnackbarKey, useSnackbar } from 'notistack';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { isElectron } from '../helpers/isElectron';
import { UI_INITIALIZE_PLUGIN_VIEWS } from '../redux/actions/actions';
import { useTypedSelector } from '../redux/reducers/reducers';
import { fetchAndExecutePlugins } from './index';
import { pluginsLoaded, setPluginSettings } from './pluginsSlice';

/**
 * For discovering and executing plugins.
 *
 * Compared to loading plugins in script tags, doing it this way has some benefits:
 *
 * 1) We can more easily catch certain types of errors in execution. With a
 *   script tag we can not catch errors in the running scripts.
 * 2) We can load the scripts into a context other than global/window. This
 *   means that plugins do not pollute the global namespace.
 */
export default function Plugins() {
  const dispatch = useDispatch();
  const { closeSnackbar, enqueueSnackbar } = useSnackbar();
  const history = useHistory();
  const { t } = useTranslation();

  const settingsPlugins = useTypedSelector(state => state.plugins.pluginSettings);

  // only run on first load
  useEffect(() => {
    dispatch({ type: UI_INITIALIZE_PLUGIN_VIEWS });

    fetchAndExecutePlugins(
      settingsPlugins,
      updatedSettingsPackages => {
        dispatch(setPluginSettings(updatedSettingsPackages));
      },
      incompatiblePlugins => {
        const pluginList = Object.values(incompatiblePlugins)
          .map(p => p.name)
          .join(', ');
        const message = t(
          'translation|Warning. Incompatible plugins disabled: ({{ pluginList }})',
          { pluginList }
        );
        console.warn(message);

        if (isElectron()) {
          enqueueSnackbar(message, {
            action: (snackbarId: SnackbarKey) => (
              <>
                <Button
                  color="secondary"
                  size="small"
                  onClick={() => {
                    history.push('/settings/plugins');
                    closeSnackbar(snackbarId);
                  }}
                >
                  {t('Settings')}
                </Button>
              </>
            ),
          });
        } else {
          enqueueSnackbar(message);
        }
      }
    )
      .finally(() => {
        dispatch(pluginsLoaded());
        // Warn the app (if we're in app mode).
        window.desktopApi?.send('pluginsLoaded');
      })
      .catch(console.error);
  }, []);
  return null;
}

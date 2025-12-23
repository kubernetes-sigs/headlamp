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
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import { useTheme } from '@mui/material/styles';
import { SwitchProps } from '@mui/material/Switch';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { MRT_Row } from 'material-react-table';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { isElectron } from '../../../helpers/isElectron';
import { useFilterFunc } from '../../../lib/util';
import { PluginInfo, reloadPage, setPluginSettings } from '../../../plugin/pluginsSlice';
import { useTypedSelector } from '../../../redux/hooks';
import { Link as HeadlampLink } from '../../common/';
import SectionBox from '../../common/SectionBox';
import SectionFilterHeader from '../../common/SectionFilterHeader';
import Table from '../../common/Table';

/**
 * Interface of the component's props structure.
 *
 * plugins: will consist of an array of plugin data objects
 *
 * @see PluginInfo
 *
 * onSave: function that will handle the named plugins data array
 */
export interface PluginSettingsPureProps {
  plugins: PluginInfo[];
  onSave: (plugins: PluginInfo[]) => void;
  saveAlwaysEnable?: boolean;
}

/** PluginSettingsProp intentially left empty to remain malleable */
export interface PluginSettingsProps {}

const EnableSwitch = (props: SwitchProps) => {
  const theme = useTheme();

  return (
    <Switch
      focusVisibleClassName=".Mui-focusVisible"
      disableRipple
      sx={{
        width: 42,
        height: 26,
        padding: 0,
        '& .MuiSwitch-switchBase': {
          padding: 0,
          margin: '2px',

          transitionDuration: '300ms',
          '&.Mui-checked': {
            transform: 'translateX(16px)',
            color: '#fff',
            '& + .MuiSwitch-track': {
              backgroundColor: theme.palette.mode === 'dark' ? '#2ECA45' : '#0078d4',
              opacity: 1,
              border: 0,
            },
            '&.Mui-disabled + .MuiSwitch-track': {
              opacity: 0.5,
            },
          },
          '&.Mui-focusVisible .MuiSwitch-thumb': {
            color: '#33cf4d',
            border: '6px solid #fff',
          },
          '&.Mui-disabled .MuiSwitch-thumb': {
            color:
              theme.palette.mode === 'light' ? theme.palette.grey[100] : theme.palette.grey[600],
          },
          '&.Mui-disabled + .MuiSwitch-track': {
            opacity: theme.palette.mode === 'light' ? 0.7 : 0.3,
          },
        },
        '& .MuiSwitch-thumb': {
          boxSizing: 'border-box',
          width: 22,
          height: 22,
        },
        '& .MuiSwitch-track': {
          borderRadius: 26 / 2,
          backgroundColor: theme.palette.mode === 'light' ? '#E9E9EA' : '#39393D',
          opacity: 1,
          transition: theme.transitions.create(['background-color'], {
            duration: 500,
          }),
        },
      }}
      {...props}
    />
  );
};

/** PluginSettingsPure is the main component to where we render the plugin data. */
export function PluginSettingsPure(props: PluginSettingsPureProps) {
  const { t } = useTranslation(['translation']);

  /** Plugin arr to be rendered to the page from prop data */
  const pluginArr: any = props.plugins ? props.plugins : [];

  /** enableSave state enables the save button when changes are made to the plugin list */
  const [enableSave, setEnableSave] = useState(false);

  /**
   * pluginChanges state is the array of plugin data and any current changes made by the user to a plugin's "Enable" field via toggler.
   * The name and origin fields are split for consistency.
   * Plugins that are not loaded (isLoaded === false) are initialized with isEnabled = false.
   */
  const [pluginChanges, setPluginChanges] = useState(() =>
    pluginArr.map((plugin: PluginInfo) => {
      const [author, name] = plugin.name.includes('@')
        ? plugin.name.split(/\/(.+)/)
        : [null, plugin.name];

      return {
        ...plugin,
        displayName: name ?? plugin.name,
        origin: plugin.origin ?? author?.substring(1) ?? t('translation|Unknown'),
        // If the plugin is not loaded, ensure it's disabled
        isEnabled: plugin.isLoaded === false ? false : plugin.isEnabled,
      };
    })
  );

  /**
   * useEffect to control the rendering of the save button.
   * By default, the enableSave is set to false.
   * If props.plugins matches pluginChanges enableSave is set to false, disabling the save button.
   */
  useEffect(() => {
    /** This matcher function compares the fields of name, type and isEnabled of each object in props.plugins to each object in pluginChanges */
    function matcher(objA: PluginInfo, objB: PluginInfo) {
      return (
        objA.name === objB.name && objA.type === objB.type && objA.isEnabled === objB.isEnabled
      );
    }

    /**
     * arrayComp returns true if each object in both arrays are identical by name, type and isEnabled.
     * If both arrays are identical in this scope, then no changes need to be saved.
     * If they do not match, there are changes in the pluginChanges array that can be saved and thus enableSave should be enabled.
     */
    const arrayComp = props.plugins.every((val, key) => matcher(val, pluginChanges[key]));

    /** For storybook usage, determines if the save button should be enabled by default */
    if (props.saveAlwaysEnable) {
      setEnableSave(true);
    } else {
      if (arrayComp) {
        setEnableSave(false);
      }
      if (!arrayComp) {
        setEnableSave(true);
      }
    }
  }, [pluginChanges]);

  /**
   * onSaveButton function to be called once the user clicks the Save button.
   * This function then takes the current state of the pluginChanges array and inputs it to the onSave prop function.
   */
  function onSaveButtonHandler() {
    props.onSave(pluginChanges);
  }

  /**
   * On change function handler to control the enableSave state and update the pluginChanges state.
   * This function is called on every plugin toggle action and recreates the state for pluginChanges.
   * Once the user clicks a toggle, the Save button is also rendered via setEnableSave.
   * Now handles plugins by both name and type to support multiple versions of the same plugin.
   * When enabling a plugin, it automatically disables other versions of the same plugin.
   */
  function switchChangeHandler(plug: { name: any; type?: string; isEnabled?: boolean }) {
    const plugName = plug.name;
    const plugType = plug.type;
    const newEnabledState = !plug.isEnabled;

    setPluginChanges((currentInfo: any[]) =>
      currentInfo.map((p: { name: any; type?: string; isEnabled: any }) => {
        // Match by both name and type to handle multiple versions
        if (p.name === plugName && p.type === plugType) {
          return { ...p, isEnabled: newEnabledState };
        }
        // If we're enabling this plugin, disable other versions with the same name
        if (newEnabledState && p.name === plugName && p.type !== plugType) {
          return { ...p, isEnabled: false };
        }
        return p;
      })
    );
  }

  return (
    <>
      <SectionBox
        title={<SectionFilterHeader title={t('translation|Plugins')} noNamespaceFilter />}
      >
        <Table
          columns={[
            {
              header: t('translation|Name'),
              accessorKey: 'name',
              muiTableBodyCellProps: {
                sx: {
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  width: 'unset',
                },
              },
              Cell: ({ row: { original: plugin } }: { row: MRT_Row<PluginInfo> }) => {
                // Check if there are clashing plugins (same name, different type)
                const hasClashingPlugins = pluginChanges.some(
                  (p: PluginInfo) => p.name === plugin.name && p.type !== plugin.type
                );

                return (
                  <>
                    <Typography variant="subtitle1">
                      <HeadlampLink
                        routeName={'pluginDetails'}
                        params={{ name: plugin.name, type: plugin.type || 'shipped' }}
                        align="right"
                      >
                        {plugin.displayName}
                      </HeadlampLink>
                      {hasClashingPlugins && (
                        <Chip
                          label={t('translation|Multiple versions')}
                          size="small"
                          color="warning"
                          variant="outlined"
                          sx={{ ml: 1, fontSize: '0.7rem', height: '18px' }}
                        />
                      )}
                    </Typography>
                    <Typography variant="caption">{plugin.version}</Typography>
                  </>
                );
              },
            },
            {
              header: t('translation|Description'),
              accessorKey: 'description',
            },
            {
              header: t('translation|Type'),
              accessorFn: (plugin: PluginInfo) => plugin.type || 'unknown',
              Cell: ({ row: { original: plugin } }: { row: MRT_Row<PluginInfo> }) => {
                const typeLabels: Record<string, { label: string; color: any }> = {
                  development: {
                    label: t('translation|Development'),
                    color: 'primary',
                  },
                  user: {
                    label: t('translation|User-installed'),
                    color: 'info',
                  },
                  shipped: {
                    label: t('translation|Shipped'),
                    color: 'default',
                  },
                };
                const typeInfo = typeLabels[plugin.type || 'shipped'];
                return <Chip label={typeInfo.label} size="small" color={typeInfo.color} />;
              },
            },
            {
              header: t('translation|Origin'),
              Cell: ({ row: { original: plugin } }: { row: MRT_Row<PluginInfo> }) => {
                const url = plugin?.homepage || plugin?.repository?.url;
                return plugin?.origin ? (
                  url ? (
                    <Link href={url}>{plugin.origin}</Link>
                  ) : (
                    plugin?.origin
                  )
                ) : (
                  t('translation|Unknown')
                );
              },
            },
            {
              header: t('translation|Status'),
              Cell: ({ row: { original: plugin } }: { row: MRT_Row<PluginInfo> }) => {
                if (plugin.isCompatible === false) {
                  return (
                    <Tooltip
                      title={t(
                        'translation|This plugin is not compatible with this version of Headlamp'
                      )}
                    >
                      <Chip label={t('translation|Incompatible')} size="small" color="error" />
                    </Tooltip>
                  );
                }

                // Show if this plugin is overridden by a higher priority version
                if (plugin.isLoaded === false && plugin.overriddenBy) {
                  const overrideLabels: Record<string, string> = {
                    development: t('translation|Development'),
                    user: t('translation|User-installed'),
                    shipped: t('translation|Shipped'),
                  };
                  return (
                    <Tooltip
                      title={t('translation|Overridden by {{type}} version', {
                        type: overrideLabels[plugin.overriddenBy],
                      })}
                    >
                      <Chip
                        label={t('translation|Not Loaded')}
                        size="small"
                        color="warning"
                        variant="outlined"
                      />
                    </Tooltip>
                  );
                }

                // Show if disabled
                if (plugin.isEnabled === false) {
                  return (
                    <Chip
                      label={t('translation|Disabled')}
                      size="small"
                      color="default"
                      variant="outlined"
                    />
                  );
                }

                // Show if loaded and enabled
                return <Chip label={t('translation|Loaded')} size="small" color="success" />;
              },
            },
            {
              header: t('translation|Enable'),
              accessorFn: (plugin: PluginInfo) => plugin.isEnabled,
              Cell: ({ row: { original: plugin } }: { row: MRT_Row<PluginInfo> }) => {
                if (!plugin.isCompatible || !isElectron()) {
                  return null;
                }

                // Find the current state of this plugin in pluginChanges
                const currentPlugin = pluginChanges.find(
                  (p: PluginInfo) => p.name === plugin.name && p.type === plugin.type
                );

                // Plugin should be checked if it's enabled in the current state
                const isChecked = currentPlugin?.isEnabled !== false;

                return (
                  <EnableSwitch
                    aria-label={`Toggle ${plugin.name}`}
                    checked={isChecked}
                    onChange={() => switchChangeHandler(plugin)}
                    color="primary"
                    name={plugin.name}
                  />
                );
              },
            },
          ]
            // remove the enable column if we're not in app mode
            .filter(el => !(el.header === t('translation|Enable') && !isElectron()))}
          data={pluginChanges}
          filterFunction={useFilterFunc<PluginInfo>(['.name'])}
          muiTableBodyRowProps={({ row }) => {
            const plugin = row.original as PluginInfo;
            // Check if there are clashing plugins (same name, different type)
            const hasClashingPlugins = pluginChanges.some(
              (p: PluginInfo) => p.name === plugin.name && p.type !== plugin.type
            );

            // Generate a consistent color based on plugin name
            if (hasClashingPlugins) {
              const hash = plugin.name.split('').reduce((acc, char) => {
                return char.charCodeAt(0) + ((acc << 5) - acc);
              }, 0);
              const hue = Math.abs(hash) % 360;

              return {
                sx: {
                  backgroundColor: theme =>
                    theme.palette.mode === 'dark'
                      ? `hsla(${hue}, 30%, 20%, 0.3)`
                      : `hsla(${hue}, 50%, 85%, 0.4)`,
                  '&:hover': {
                    backgroundColor: theme =>
                      theme.palette.mode === 'dark'
                        ? `hsla(${hue}, 30%, 25%, 0.4) !important`
                        : `hsla(${hue}, 50%, 80%, 0.5) !important`,
                  },
                },
              };
            }
            return {};
          }}
        />
      </SectionBox>
      {enableSave && isElectron() && (
        <Box
          sx={{
            position: 'sticky',
            bottom: 0,
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '12px 16px',
            backgroundColor: theme => theme.palette.background.paper,
            borderTop: theme => `1px solid ${theme.palette.divider}`,
            zIndex: 10,
            margin: '-16px -16px 0 -16px',
          }}
        >
          <Button variant="contained" color="primary" onClick={() => onSaveButtonHandler()}>
            {t('translation|Save & Apply')}
          </Button>
        </Box>
      )}
    </>
  );
}

/** Container function for the PluginSettingsPure, onSave prop returns plugins */
export default function PluginSettings() {
  const dispatch = useDispatch();

  const pluginSettings = useTypedSelector(state => state.plugins.pluginSettings);

  return (
    <PluginSettingsPure
      plugins={pluginSettings}
      onSave={plugins => {
        dispatch(setPluginSettings(plugins));
        dispatch(reloadPage());
      }}
    />
  );
}

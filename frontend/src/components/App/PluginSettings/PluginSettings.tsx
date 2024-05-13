import { useTheme } from '@mui/material';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import { SwitchProps } from '@mui/material/Switch';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import helpers from '../../../helpers';
import { useFilterFunc } from '../../../lib/util';
import { PluginInfo, reloadPage, setPluginSettings } from '../../../plugin/pluginsSlice';
import { useTypedSelector } from '../../../redux/reducers/reducers';
import HeadlampLink from '../../common/Link';
import SectionBox from '../../common/SectionBox';
import SectionFilterHeader from '../../common/SectionFilterHeader';
import SimpleTable from '../../common/SimpleTable';

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

  /** pluginChanges state is the array of plugin data and any current changes made by the user to a plugin's "Enable" field via toggler */
  const [pluginChanges, setPluginChanges] = useState(() => pluginArr.map((p: any) => p));

  /**
   * useEffect to control the rendering of the save button.
   * By default, the enableSave is set to false.
   * If props.plugins matches pluginChanges enableSave is set to false, disabling the save button.
   */
  useEffect(() => {
    /** This matcher function compares the fields of name and isEnabled of each object in props.plugins to each object in pluginChanges */
    function matcher(objA: PluginInfo, objB: PluginInfo) {
      return objA.name === objB.name && objA.isEnabled === objB.isEnabled;
    }

    /**
     * arrayComp returns true if each object in both arrays are identical by name and isEnabled.
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
   */
  function switchChangeHanlder(plug: { name: any }) {
    const plugName = plug.name;

    setPluginChanges((currentInfo: any[]) =>
      currentInfo.map((p: { name: any; isEnabled: any }) => {
        if (p.name === plugName) {
          return { ...p, isEnabled: !p.isEnabled };
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
        <SimpleTable
          columns={[
            {
              label: t('translation|Name'),
              getter: (plugin: PluginInfo) => {
                return (
                  <>
                    <Typography variant="subtitle1">
                      <HeadlampLink
                        routeName={'pluginDetails'}
                        params={{ name: plugin.name }}
                        align="right"
                      >
                        {plugin.name}
                      </HeadlampLink>
                    </Typography>
                    <Typography variant="caption">{plugin.version}</Typography>
                  </>
                );
              },
              sort: (a: PluginInfo, b: PluginInfo) => a.name.localeCompare(b.name),
            },
            {
              label: t('translation|Description'),
              datum: 'description',
              sort: true,
            },
            {
              label: t('translation|Origin'),
              getter: (plugin: PluginInfo) => {
                const url = plugin?.homepage || plugin?.repository?.url;
                return plugin?.origin ? (
                  url ? (
                    <Link href={url}>{plugin?.origin}</Link>
                  ) : (
                    plugin?.origin
                  )
                ) : (
                  t('translation|Unknown')
                );
              },
              sort: true,
            },
            // TODO: Fetch the plugin status from the plugin settings store
            {
              label: t('translation|Status'),
              getter: (plugin: PluginInfo) => {
                if (plugin.isCompatible === false) {
                  return t('translation|Incompatible');
                }
                return plugin.isEnabled ? t('translation|Enabled') : t('translation|Disabled');
              },
              sort: true,
            },
            {
              label: t('translation|Enable'),
              getter: (plugin: PluginInfo) => {
                if (!plugin.isCompatible || !helpers.isElectron()) {
                  return null;
                }
                return (
                  <EnableSwitch
                    aria-label={`Toggle ${plugin.name}`}
                    checked={plugin.isEnabled}
                    onChange={() => switchChangeHanlder(plugin)}
                    color="primary"
                    name={plugin.name}
                  />
                );
              },
              sort: (a: PluginInfo, b: PluginInfo) =>
                a.isEnabled === b.isEnabled ? 0 : a.isEnabled ? -1 : 1,
            },
          ]
            // remove the enable column if we're not in app mode
            .filter(el => !(el.label === t('translation|Enable') && !helpers.isElectron()))}
          data={pluginChanges}
          filterFunction={useFilterFunc<PluginInfo>(['.name'])}
        />
      </SectionBox>
      {enableSave && (
        <Box sx={{ display: `flex`, justifyContent: `flex-end`, margin: `5px` }}>
          <Button
            variant="contained"
            color="primary"
            sx={{ margin: `5px` }}
            onClick={() => onSaveButtonHandler()}
          >
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

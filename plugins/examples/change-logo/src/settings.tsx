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

import { ConfigStore } from '@kinvolk/headlamp-plugin/lib';
import { NameValueTable } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { useEffect, useState } from 'react';

/**
 * The Settings component for the change-logo plugin allows users to configure certain properties, such as the logo URL.
 * The component uses the ConfigStore to manage the plugin configuration and automatically saves updates to the store.
 *
 */

/**
 * A text input component with auto-save functionality. It debounces the input value changes and triggers the onSave callback after a specified delay, allowing for efficient data saving with minimal performance impact.
 *
 * @param {Object} props - The component props.
 * @param {function(string): void} props.onSave - Callback function to save the value. It receives the current value as its only argument.
 * @param {string} [props.defaultValue=''] - The default value of the input.
 * @param {number} [props.delay=1000] - The delay in milliseconds before the onSave callback is invoked after the user stops typing.
 * @param {string} [props.helperText=''] - Optional helper text to display below the input.
 * @returns {JSX.Element} The AutoSaveInput component.
 */
function AutoSaveInput({ onSave, defaultValue = '', delay = 1000, helperText = '' }) {
  const [value, setValue] = useState(defaultValue);
  const [timer, setTimer] = useState(null);

  const handleChange = event => {
    const newValue = event.target.value;
    setValue(newValue);

    if (timer) {
      clearTimeout(timer);
    }

    const newTimer = setTimeout(() => onSave(newValue), delay);
    setTimer(newTimer);
  };

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [timer]);

  return (
    <TextField
      fullWidth
      InputProps={{ style: { borderBottom: '1px solid rgba(0, 0, 0, 0.42)' } }}
      InputLabelProps={{
        shrink: true,
        style: { display: 'none' },
      }}
      helperText={helperText}
      value={value}
      onChange={handleChange}
      variant="standard"
    />
  );
}

interface pluginConfig {
  url: string;
}

export const store = new ConfigStore<pluginConfig>('change-logo');

/**
 * Settings component for managing plugin configuration details.
 * It allows users to update specific configuration properties, such as the logo URL,
 * and automatically saves these updates to a persistent store.
 *
 * @returns {JSX.Element} The rendered settings component with configuration options.
 */
export default function Settings() {
  // Retrieve initial configuration from the store
  const config = store.get();
  // State to manage the current configuration within the component
  const [currentConfig, setCurrentConfig] = useState(config);

  /**
   * Handles saving the updated configuration value to the store.
   * It updates the specified configuration property and refreshes the local component state
   * to reflect the latest configuration.
   *
   * @param {string} value - The new value for the configuration property to be updated.
   */
  function handleSave(value) {
    const updatedConfig = { url: value };
    // Save the updated configuration to the store
    store.set(updatedConfig);
    // Update the component state to reflect the new configuration
    setCurrentConfig(store.get());
  }

  // Define rows for the settings table, including the AutoSaveInput component for the logo URL
  const settingsRows = [
    {
      name: 'Logo URL',
      value: (
        <AutoSaveInput
          defaultValue={currentConfig?.url}
          onSave={handleSave}
          delay={1000}
          helperText={'Enter the URL of your logo.'}
        />
      ),
    },
  ];

  // Render the settings component
  return (
    <Box width={'80%'} style={{ paddingTop: '8vh' }}>
      <NameValueTable rows={settingsRows} />
    </Box>
  );
}

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

import { app } from 'electron';
import fs from 'node:fs';
import path from 'path';

export const SETTINGS_PATH = path.join(app?.getPath('userData') || 'testing', 'settings.json');

/**
 * Loads the user settings.
 * If the settings file does not exist, an empty object is returned.
 * @returns The settings object.
 */
export function loadSettings(settingsPath: string): Record<string, any> {
  try {
    const data = fs.readFileSync(settingsPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

/**
 * Saves the user settings.
 * @param settings - The settings object to save.
 */
export function saveSettings(settingsPath: string, settings: Record<string, any>) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings), 'utf-8');
}

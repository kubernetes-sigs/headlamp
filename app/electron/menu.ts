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

import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';

export interface AppMenu extends Omit<Partial<MenuItemConstructorOptions>, 'click'> {
  /** A URL to open (if not starting with http, then it'll be opened in the app window) */
  url?: string;
  /** The submenus of this menu */
  submenu?: AppMenu[];
  /** A string identifying this menu */
  id: string;
  /** Whether to render this menu only after plugins are loaded */
  afterPlugins?: boolean;
}

interface MenuActions {
  openExternal(url: string): Promise<void>;
  openAboutDialog(): void;
  adjustZoom(delta: number): void;
  setZoom(factor: number): void;
}

export function menusToTemplate(
  mainWindow: BrowserWindow | null,
  menusFromPlugins: AppMenu[],
  loadFullMenu: boolean,
  actions: MenuActions
) {
  const menusToDisplay: MenuItemConstructorOptions[] = [];
  menusFromPlugins.forEach(appMenu => {
    const { url, afterPlugins = false, ...otherProps } = appMenu;
    const menu: MenuItemConstructorOptions = otherProps;

    if (!loadFullMenu && afterPlugins) {
      return;
    }

    if (appMenu.id === 'original-about-help') {
      menu.click = () => {
        actions.openAboutDialog();
      };
    } else if (appMenu.id === 'original-zoom-in') {
      menu.click = () => actions.adjustZoom(0.1);
    } else if (appMenu.id === 'original-zoom-out') {
      menu.click = () => actions.adjustZoom(-0.1);
    } else if (appMenu.id === 'original-reset-zoom') {
      menu.click = () => actions.setZoom(1.0);
    } else if (url) {
      menu.click = () => {
        const openUrl =
          mainWindow && !url.startsWith('http')
            ? mainWindow.webContents.loadURL(url)
            : actions.openExternal(url);
        void openUrl.catch(error => console.error(`Failed to open menu URL ${url}:`, error));
      };
    }

    if (Array.isArray(otherProps.submenu)) {
      menu.submenu = menusToTemplate(mainWindow, otherProps.submenu, loadFullMenu, actions);
    }

    menusToDisplay.push(menu);
  });

  return menusToDisplay;
}

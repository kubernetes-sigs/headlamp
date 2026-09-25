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
import { isAppUrl, isSafeExternalUrl } from './urlSafety';

export interface AppMenu extends Omit<Partial<MenuItemConstructorOptions>, 'click'> {
  /** A URL to open: an app URL is opened in the app window, an http(s) URL in the
   * external browser. Anything else is ignored. */
  url?: string;
  /** The submenus of this menu */
  submenu?: AppMenu[];
  /** A string identifying this menu */
  id: string;
  /** Whether to render this menu only after plugins are loaded */
  afterPlugins?: boolean;
}

interface MenuActions {
  /** The URL the app window was started with. Menu URLs are validated against
   * it, because the menu spec comes from the renderer. */
  startUrl: string;
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
        // Validate before either sink: only an app URL may be loaded into the
        // window, which runs with the app's preload script, and only an http(s)
        // URL may be handed to the OS shell opener.
        let openUrl: Promise<void>;
        if (mainWindow && isAppUrl(url, actions.startUrl)) {
          openUrl = mainWindow.webContents.loadURL(url);
        } else if (isSafeExternalUrl(url)) {
          openUrl = actions.openExternal(url);
        } else {
          console.warn(`Ignoring menu URL ${url}: not an app URL nor an http(s) URL.`);
          return;
        }
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

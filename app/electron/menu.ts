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
import { isSafeExternalUrl } from './urlValidation';

export interface AppMenu extends Omit<Partial<MenuItemConstructorOptions>, 'click'> {
  /** A URL to open in the external browser. Only http and https URLs are followed. */
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
        // Only http and https menu URLs are followed, and always in the external
        // browser. Other schemes (file://, smb://, data:, custom protocols) are
        // ignored: a menu item can come from a plugin, and handing such a URL to
        // the OS or loading it into the app window would run untrusted content
        // with the app's privileges.
        if (!isSafeExternalUrl(url)) {
          console.error(`Ignoring menu URL ${url}: only http and https are allowed`);
          return;
        }

        void actions
          .openExternal(url)
          .catch(error => console.error(`Failed to open menu URL ${url}:`, error));
      };
    }

    if (Array.isArray(otherProps.submenu)) {
      menu.submenu = menusToTemplate(mainWindow, otherProps.submenu, loadFullMenu, actions);
    }

    menusToDisplay.push(menu);
  });

  return menusToDisplay;
}

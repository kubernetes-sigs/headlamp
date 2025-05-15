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

import { getProductName, getVersion } from '../helpers/getProductInfo';
import { isElectron } from '../helpers/isElectron';
/**
 * The lib.ts file should carry the bits to be used by plugins whereas
 * the index.ts should have the functions that Headlamp itself needs for
 * loading the plugins.
 */
/**
 * ## Simple plugin example
 *
 * @example
 *
 * ```tsx
 * import { registerAppBarAction } from '@kinvolk/headlamp-plugin/lib';
 * registerAppBarAction(<span>Hello Kubernetes</span>);
 * ```
 *
 * ## Entry point
 *
 * initializePlugins is the main entry point, and it is called by App.tsx near the beginning.
 *
 * ## Loading JavaScript files/URLs, which register Plugins
 *
 * External JavaScripts are first loaded from the "/plugins/list" URL of URLs into the browser.
 * The backend "server" can currently be configured to load plugins from a folder to make this list.
 *
 * Local in-development plugins are then loaded from the "frontend/src/plugin/plugins/" folder.
 *
 * To see more on what plugins can do, please see the plugin functionality.md documentation.
 *
 * @see {@link https://headlamp.dev/docs/latest/development/plugins/functionality/ Plugin functionality}
 */
import { ClusterRequest, setCluster } from '../lib/k8s/apiProxy';
import Registry from './registry';

/**
 * Plugins may call Headlamp.registerPlugin(pluginId: string, pluginObj: Plugin) to register themselves.
 *
 * They will have their initialize(register) method called at plugin initialization time.
 *
 */
export abstract class Plugin {
  /**
   * initialize is called for each plugin with a Registry which gives the plugin methods for doing things.
   *
   * @returns The return code is not used, but used to be required.
   *
   * @see Registry
   */
  abstract initialize(register: Registry): boolean | void;
}

declare global {
  interface Window {
    pluginLib: {
      [libName: string]: any;
    };
    plugins: {
      [pluginId: string]: Plugin;
    };
    registerPlugin: (pluginId: string, pluginObj: Plugin) => void;
    desktopApi: any;
  }
}

/**
 * The members of AppMenu should be the same as the options for the MenuItem in https://www.electronjs.org/docs/latest/api/menu-item
 * except for the "submenu" (which is the AppMenu type) and "click" (which is not supported here, use the
 * "url" field instead).
 */
export interface AppMenu {
  /** A URL to open (if not starting with http, then it'll be opened in the external browser) */
  url?: string;
  /** The submenus of this menu */
  submenu?: AppMenu[];
  /** Any other members from Electron's MenuItem. */
  [key: string]: any;
}

let currentAppMenus: AppMenu[] | null = null;

/**
 * This class is a more convenient way for plugins to call registerPlugin in
 * order to register themselves.
 */
export abstract class Headlamp {
  /**
   * Got a new plugin to add? Well, registerPlugin is your friend.
   *
   * @param pluginId - a unique id string for your plugin.
   * @param pluginObj - the plugin being added.
   *
   * @example
   *
   * ```javascript
   * const myPlugin = {
   *   initialize: (register) => {
   *     // do some stuff with register
   *     // use some libraries in window.pluginLib
   *     return true;
   *   }
   * }
   *
   * Headlamp.registerPlugin("aPluginIdString", myPlugin)
   * ```
   */
  static registerPlugin(pluginId: string, pluginObj: Plugin) {
    // @todo: what happens if this plugin exists? (and is already initialized?)
    //        Should it raise an error? Silently keep going? Do we need quit() methods on plugins?
    window.plugins[pluginId] = pluginObj;
  }

  /**
   * Configure (or update) a cluster that can then be used throughout Headlamp.
   * If the request is successful, further calls to `K8s.useClustersConf()`
   * will show the newly configured cluster.
   *
   * **Important:** This is only available in the desktop version and will result in a
   * bad request when running in-cluster.
   *
   * @param clusterReq - the cluster to be added or updated.
   * @returns a promise which completes to Headlamp's configuration (showing the list of configured clusters).
   */
  static setCluster(clusterReq: ClusterRequest) {
    return setCluster(clusterReq).catch(e => {
      console.error(e);
    });
  }

  /**
   * Changes the app menu.
   * If Headlamp is not running as a desktop app, then this method prints an error and doesn't do anything.
   *
   * @param appMenuFunc A function that receives the current app menu configuration and a new one. If the function returns null, the menu is not changed.
   */
  static setAppMenu(appMenuFunc: (currentAppMenuSpec: AppMenu[] | null) => AppMenu[] | null) {
    if (!isElectron()) {
      console.error('Cannot set app menu: not running as a desktop app!');
      return;
    }

    // Update our (renderer) local copy
    currentAppMenus = appMenuFunc(currentAppMenus);
    window.desktopApi.send('setMenu', currentAppMenus);
  }

  /**
   * Returns whether Headlamp is running as a desktop app.
   *
   * @returns true if Headlamp is running as a desktop app.
   */
  static isRunningAsApp() {
    return isElectron();
  }

  /**
   * Returns the version of Headlamp as an object with a VERSION (application version) and
   * GIT_VERSION (commit) fields. Like:
   * { VERSION: 'v0.0.0', GIT_VERSION: '0000000000000}
   *
   * @returns the version of Headlamp.
   */
  getVersion() {
    const version = getVersion();
    return { VERSION: version.VERSION || '', GIT_VERSION: version.GIT_VERSION || '' };
  }

  /**
   * Returns the name of the product.
   *
   * @returns the name of the product.
   */
  getProductName() {
    return getProductName() || '';
  }
}

window.desktopApi?.receive('currentMenu', (currentMenus: AppMenu[]) => {
  console.debug('Received current menu config from app', currentMenus);
  currentAppMenus = currentMenus;
});

window.registerPlugin = Headlamp.registerPlugin;

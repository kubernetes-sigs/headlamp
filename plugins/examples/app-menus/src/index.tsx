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

import { Headlamp, Plugin, runCommand } from '@kinvolk/headlamp-plugin/lib';

class AppMenuDemo extends Plugin {
  static warnedOnce = false;

  initialize(): boolean {
    console.log('app-menus plugin initialized');

    if (!AppMenuDemo.warnedOnce && !Headlamp.isRunningAsApp()) {
      AppMenuDemo.warnedOnce = true;
      window.alert(
        'app-menus plugin: Headlamp is running as an app. This plugin will not do anything!'
      );
      return;
    }

    Headlamp.setAppMenu(menus => {
      let chatMenu = menus?.find(menu => menu.id === 'custom-menu-item') || null;
      if (!chatMenu) {
        chatMenu = {
          label: 'Chat with us',
          id: 'custom-menu-item',
          submenu: [
            {
              label: 'This menu is an example from the app-menus plugin',
              enabled: false,
            },
            {
              label: 'Open Headlamp Slack',
              url: 'https://kubernetes.slack.com/messages/headlamp',
            },
          ],
        };

        menus.push(chatMenu);
      }
      return menus;
    });

    // Let's show the status of a minikube command if it's installed.
    // In app mode we can run a few local commands (only minikube and az so far).

    function minikubeMenu() {
      const minikube = runCommand('minikube', ['status']);
      const output = [];

      minikube.stdout.on('data', data => {
        output.push(data);
      });

      minikube.on('exit', code => {
        if (code === 0) {
          Headlamp.setAppMenu(menus => {
            let minikubeMenu = menus?.find(menu => menu.id === 'custom-menu-minikube') || null;
            if (!minikubeMenu) {
              minikubeMenu = {
                label: 'Minikube',
                id: 'custom-menu-minikube',
                submenu: output
                  .join('')
                  .split('\n')
                  .filter(line => line !== '')
                  .map(line => {
                    return {
                      label: line,
                      enabled: false,
                    };
                  }),
              };

              menus.push(minikubeMenu);
            }
            return menus;
          });
        }
      });
    }
    minikubeMenu();
    // run the command every 5 seconds.
    setTimeout(minikubeMenu, 5000);
  }
}

Headlamp.registerPlugin('app-menus', new AppMenuDemo());

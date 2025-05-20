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

import Button from '@mui/material/Button';
import React, { ReactNode } from 'react';

interface OauthPopupProps {
  width?: number;
  height?: number;
  url: string;
  title?: string;
  onClose?: () => any;
  onCode: (params: any) => any;
  children?: ReactNode;
  button: typeof Button;
}

const defaultOauthPopupProps = {
  onClose: () => {},
  width: 500,
  height: 500,
  url: '',
  title: '',
};

const OauthPopup: React.FC<OauthPopupProps> = props => {
  let externalWindow: Window | null;

  React.useEffect(
    () => {
      return () => {
        if (externalWindow) {
          externalWindow.close();
        }
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const createPopup = () => {
    const { url, title, width, height, onCode } = { ...defaultOauthPopupProps, ...props };
    const left = window.screenX + ((window.outerWidth - width) as number) / 2;
    const top = window.screenY + ((window.outerHeight - height) as number) / 2.5;

    const windowFeatures = `toolbar=0,scrollbars=1,status=1,resizable=0,location=1,menuBar=0,width=${width},height=${height},top=${top},left=${left}`;

    externalWindow = window.open(url, title, windowFeatures);

    const storageListener = () => {
      try {
        const authStatus = localStorage.getItem('auth_status');
        if (authStatus) {
          onCode(authStatus);
          localStorage.removeItem('auth_status');
          if (externalWindow) {
            externalWindow.close();
          }
          window.removeEventListener('storage', storageListener);
        }
      } catch (e) {
        console.log('error occured while closing auth window', e);
        window.removeEventListener('storage', storageListener);
      }
    };

    window.addEventListener('storage', storageListener);

    if (externalWindow) {
      try {
        externalWindow.addEventListener(
          'beforeunload',
          () => {
            if (!!props.onClose) {
              props.onClose();
            }
          },
          false
        );
      } catch (e) {
        console.log('error occured while adding beforeunload event listener');
      }
    }
  };

  return <props.button onClick={createPopup}>{props.children}</props.button>;
};

export default OauthPopup;

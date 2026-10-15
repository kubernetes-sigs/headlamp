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
import { AUTH_STATUS_KEY } from './constants';

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
  const externalWindowRef = React.useRef<Window | null>(null);
  const storageListenerRef = React.useRef<(() => void) | null>(null);
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanupPopup = React.useCallback(
    (closeWindow = false) => {
      const popupWindow = externalWindowRef.current;

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      if (storageListenerRef.current) {
        window.removeEventListener('storage', storageListenerRef.current);
        storageListenerRef.current = null;
      }

      if (closeWindow && popupWindow) {
        try {
          popupWindow.close();
        } catch (e) {
          // Ignore error if popup cannot be closed (e.g. cross-origin/COOP context)
        }
        externalWindowRef.current = null;
        return;
      }

      try {
        if (popupWindow?.closed) {
          externalWindowRef.current = null;
        }
      } catch (e) {
        // Ignore cross-origin access errors
      }
    },
    [externalWindowRef]
  );

  React.useEffect(() => {
    return () => {
      cleanupPopup(true);
    };
  }, [cleanupPopup]);

  const createPopup = () => {
    const { url, title, width, height, onCode } = { ...defaultOauthPopupProps, ...props };
    const left = window.screenX + ((window.outerWidth - width) as number) / 2;
    const top = window.screenY + ((window.outerHeight - height) as number) / 2.5;

    const windowFeatures = `toolbar=0,scrollbars=1,status=1,resizable=0,location=1,menuBar=0,width=${width},height=${height},top=${top},left=${left}`;

    cleanupPopup(true);
    externalWindowRef.current = window.open(url, title, windowFeatures);

    const storageListener = () => {
      try {
        const authStatus = localStorage.getItem(AUTH_STATUS_KEY);
        if (authStatus) {
          onCode(authStatus);
          localStorage.removeItem(AUTH_STATUS_KEY);
          cleanupPopup(true);
        }
      } catch (e) {
        console.error('Error occurred while closing auth window', e);
        cleanupPopup();
      }
    };

    storageListenerRef.current = storageListener;
    window.addEventListener('storage', storageListener);

    if (externalWindowRef.current) {
      intervalRef.current = setInterval(() => {
        let isClosed = false;
        try {
          isClosed = !!externalWindowRef.current?.closed;
        } catch (e) {
          // In some browsers, accessing externalWindowRef.current.closed across origins
          // or with Cross-Origin-Opener-Policy can throw a SecurityError.
          // In that case, ignore the error and leave the completion storage listener intact.
        }

        if (isClosed) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          if (!!props.onClose) {
            props.onClose();
          }
        }
      }, 500);
    }
  };

  return <props.button onClick={createPopup}>{props.children}</props.button>;
};

export default OauthPopup;

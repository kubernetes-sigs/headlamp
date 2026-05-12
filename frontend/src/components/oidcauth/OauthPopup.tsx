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

type StorageListener = (e: StorageEvent) => void;
type BeforeUnloadListener = () => void;
type CleanupPopupOptions = {
  closeWindow?: boolean;
};

const OauthPopup: React.FC<OauthPopupProps> = props => {
  const externalWindowRef = React.useRef<Window | null>(null);
  const storageListenerRef = React.useRef<StorageListener | null>(null);
  const beforeUnloadListenerRef = React.useRef<BeforeUnloadListener | null>(null);

  const removeStorageListener = React.useCallback((storageListener: StorageListener | null) => {
    if (storageListener) {
      window.removeEventListener('storage', storageListener);
      if (storageListenerRef.current !== storageListener) {
        return;
      }
      storageListenerRef.current = null;
    }
  }, []);

  const cleanupPopupInstance = React.useCallback(
    (
      popupWindow: Window | null,
      storageListener: StorageListener | null,
      beforeUnloadListener: BeforeUnloadListener | null,
      { closeWindow = false }: CleanupPopupOptions = {}
    ) => {
      removeStorageListener(storageListener);

      if (popupWindow && beforeUnloadListener) {
        try {
          popupWindow.removeEventListener('beforeunload', beforeUnloadListener);
        } catch (e) {
          console.error('Error occurred while removing beforeunload event listener', e);
        }
        if (beforeUnloadListenerRef.current === beforeUnloadListener) {
          beforeUnloadListenerRef.current = null;
        }
      }

      if (closeWindow && popupWindow) {
        popupWindow.close();
      }

      if (
        popupWindow &&
        externalWindowRef.current === popupWindow &&
        (closeWindow || popupWindow.closed)
      ) {
        externalWindowRef.current = null;
      }
    },
    [removeStorageListener]
  );

  React.useEffect(() => {
    return () => {
      cleanupPopupInstance(
        externalWindowRef.current,
        storageListenerRef.current,
        beforeUnloadListenerRef.current,
        { closeWindow: true }
      );
    };
  }, [cleanupPopupInstance]);

  const createPopup = () => {
    const {
      url,
      title,
      width,
      height,
      onClose: onCloseProp,
      onCode,
    } = {
      ...defaultOauthPopupProps,
      ...props,
    };
    const onClose = onCloseProp ?? (() => {});
    const left = window.screenX + ((window.outerWidth - width) as number) / 2;
    const top = window.screenY + ((window.outerHeight - height) as number) / 2.5;

    const windowFeatures = `toolbar=0,scrollbars=1,status=1,resizable=0,location=1,menuBar=0,width=${width},height=${height},top=${top},left=${left}`;

    cleanupPopupInstance(
      externalWindowRef.current,
      storageListenerRef.current,
      beforeUnloadListenerRef.current,
      { closeWindow: true }
    );
    const externalWindow = window.open(url, title, windowFeatures);
    externalWindowRef.current = externalWindow;
    if (!externalWindow) {
      externalWindowRef.current = null;
      onClose();
      return;
    }

    const storageListener: StorageListener = () => {
      try {
        const authStatus = localStorage.getItem('auth_status');
        if (authStatus) {
          onCode(authStatus);
          localStorage.removeItem('auth_status');
          cleanupPopupInstance(externalWindow, storageListener, beforeUnloadListener, {
            closeWindow: externalWindowRef.current === externalWindow,
          });
        }
      } catch (e) {
        console.error('Error occurred while closing auth window', e);
        cleanupPopupInstance(externalWindow, storageListener, beforeUnloadListener);
      }
    };

    const beforeUnloadListener = () => {
      cleanupPopupInstance(externalWindow, storageListener, beforeUnloadListener);
      if (externalWindowRef.current === externalWindow) {
        externalWindowRef.current = null;
      }
      onClose();
    };

    storageListenerRef.current = storageListener;
    window.addEventListener('storage', storageListener);

    try {
      externalWindow.addEventListener('beforeunload', beforeUnloadListener, false);
      beforeUnloadListenerRef.current = beforeUnloadListener;
    } catch (e) {
      console.error('Error occurred while adding beforeunload event listener');
    }
  };

  return <props.button onClick={createPopup}>{props.children}</props.button>;
};

export default OauthPopup;

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

import { useTypedSelector } from '../redux/hooks';

export function getDefaultWebsocketMultiplexerEnabled(): boolean {
  return import.meta.env.REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER === 'true';
}

export function getWebsocketMultiplexerEnabled(setting?: boolean | null): boolean {
  return setting ?? getDefaultWebsocketMultiplexerEnabled();
}

export function useWebsocketMultiplexerEnabled(): boolean {
  const setting = useTypedSelector(state => state.config.settings.websocketMultiplexerEnabled);

  return getWebsocketMultiplexerEnabled(setting);
}

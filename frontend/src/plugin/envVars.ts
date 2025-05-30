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

/**
 * Creates a safe environment variables object to expose to plugins.
 * Only includes environment variables with the REACT_APP_ prefix.
 * 
 * @returns An object containing safe environment variables
 */
export function getSafeEnvVars(): Record<string, string> {
  const safeEnvVars: Record<string, string> = {};
  
  // Get environment variables from import.meta.env (Vite)
  const env = import.meta.env || {};
  
  // Add all REACT_APP_ prefixed environment variables
  Object.keys(env).forEach(key => {
    if (key.startsWith('REACT_APP_')) {
      safeEnvVars[key] = env[key];
    }
  });
  
  return safeEnvVars;
}
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

import { useEffect, useState } from 'react';
import { generateGlobalVarDeclarations } from './inferTypes';

/**
 * Generates a TypeScript type definition based on an array of items.
 *
 * @param items - The array of items to generate a type definition from
 * @param maxKeysPerObject - The maximum number of keys per object to include in the type definition
 * @returns A string representation of the generated TypeScript type definition
 */
export const useTypeDefinition = (items: any[], maxKeysPerObject: number) => {
  const [typeDefinition, setTypeDefinition] = useState('');

  useEffect(() => {
    const typeDef = generateGlobalVarDeclarations(items, maxKeysPerObject);
    setTypeDefinition(typeDef);
  }, [items, maxKeysPerObject]);

  return typeDefinition;
};

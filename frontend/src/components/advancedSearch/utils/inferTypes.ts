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

const MAX_STRING_LITERALS = 200; // Max distinct strings to use literal types
const MAX_STRING_LITERAL_LENGTH = 20;

interface TypeInfoNode {
  primitiveTypes: Set<string>;
  /** Stores distinct string values if count is low */
  stringLiterals: Set<string>;
  /** Flag to indicate if generic 'string' type was seen (used if literals exceed threshold) */
  hasStringType: boolean;
  isArray: boolean;
  /** Type information about items, if this is an array type */
  arrayElementInfo: TypeInfoNode | null;
  isObject: boolean;
  /** Type information about the object properties, if this is an object */
  objectProperties: Map<string, TypeInfoNode>;
  /** How many times this field is used */
  presenceCount: number;
  /** How many times parent type is used */
  parentObjectCount: number;
}

function createTypeInfoNode(): TypeInfoNode {
  return {
    primitiveTypes: new Set(),
    stringLiterals: new Set(), // Initialize the new set
    hasStringType: false, // Initialize flag
    isArray: false,
    arrayElementInfo: null,
    isObject: false,
    objectProperties: new Map(),
    presenceCount: 0,
    parentObjectCount: 0,
  };
}

/**
 * Recursively aggregates type information from a value into a TypeInfoNode.
 * Records string literals if applicable.
 */
function aggregateTypeInfo(value: any, node: TypeInfoNode, parentObjectCount: number): void {
  node.presenceCount++;
  node.parentObjectCount = parentObjectCount;

  const type = typeof value;

  if (value === null) {
    node.primitiveTypes.add('null');
  } else if (type === 'string') {
    node.hasStringType = true;
    // Add to primitive types initially (might be replaced by literals later)
    node.primitiveTypes.add('string');
    // Add the literal value if within reasonable limits for tracking
    // Avoid storing excessive amounts of unique strings if the threshold is eventually exceeded
    if (node.stringLiterals.size < MAX_STRING_LITERALS) {
      if (value.length < MAX_STRING_LITERAL_LENGTH) {
        node.stringLiterals.add(value);
      }
    } else {
      node.stringLiterals.clear();
    }
  } else if (type === 'number') {
    node.primitiveTypes.add('number');
  } else if (type === 'boolean') {
    node.primitiveTypes.add('boolean');
  } else if (Array.isArray(value)) {
    node.isArray = true;
    if (!node.arrayElementInfo) {
      node.arrayElementInfo = createTypeInfoNode();
    }
    const arrayPresenceCount = node.presenceCount;
    value.forEach(element => {
      aggregateTypeInfo(element, node.arrayElementInfo!, arrayPresenceCount);
    });
    if (node.arrayElementInfo) node.arrayElementInfo.parentObjectCount = arrayPresenceCount;
  } else if (type === 'object') {
    node.isObject = true;
    const numObjectOccurrences = node.presenceCount;
    const currentKeys = new Set<string>();

    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        currentKeys.add(key);
        if (!node.objectProperties.has(key)) {
          node.objectProperties.set(key, createTypeInfoNode());
        }
        const propertyNode = node.objectProperties.get(key)!;
        aggregateTypeInfo(value[key], propertyNode, numObjectOccurrences);
      }
    }
    node.objectProperties.forEach((propNode, key) => {
      if (!currentKeys.has(key)) {
        propNode.parentObjectCount = numObjectOccurrences;
      }
    });
  }
}

const validIdentifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * Recursively generates a TypeScript type string from a TypeInfoNode.
 * Uses string literal types if the number of distinct strings is below MAX_STRING_LITERALS.
 * @returns The generated TypeScript type string.
 */
function generateTypeString(
  node: TypeInfoNode,
  indentation: string = '',
  maxKeysPerObject: number = 25
): string {
  const types: string[] = [];

  node.primitiveTypes.forEach(type => {
    if (type !== 'string') {
      // Process string separately
      types.push(type);
    }
  });

  if (node.hasStringType) {
    // Check if we should use literals (size > 0 and within limit)
    if (node.stringLiterals.size > 0 && node.stringLiterals.size < MAX_STRING_LITERALS) {
      // Add quoted literals
      node.stringLiterals.forEach(literal => {
        // Basic escaping for quotes inside the string literal itself
        const escapedLiteral = literal.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        types.push(`"${escapedLiteral}"`);
      });
    } else {
      // Fallback to generic 'string' if too many literals or none were stored
      types.push('string');
    }
  }

  if (
    node.isObject &&
    node.objectProperties.size > 0 &&
    node.objectProperties.size < maxKeysPerObject
  ) {
    const propertyLines: string[] = [];
    const nextIndentation = indentation + '  ';
    const sortedKeys = Array.from(node.objectProperties.keys()).sort();

    for (const key of sortedKeys) {
      const propertyNode = node.objectProperties.get(key)!;
      const isOptional =
        propertyNode.parentObjectCount > 0 &&
        propertyNode.presenceCount < propertyNode.parentObjectCount;
      const formattedKey = validIdentifierRegex.test(key) ? key : `"${key}"`;
      const optionalMarker = isOptional ? '?' : '';
      const propertyTypeString = generateTypeString(
        propertyNode,
        nextIndentation,
        maxKeysPerObject
      ); // Recursive call

      propertyLines.push(
        `${nextIndentation}${formattedKey}${optionalMarker}: ${propertyTypeString};`
      );
    }

    if (propertyLines.length > 0) {
      types.push(`{\n${propertyLines.join('\n')}\n${indentation}}`);
    } else {
      types.push('Record<string, any>');
    }
  } else if (node.isObject) {
    types.push('Record<string, any>');
  }

  if (node.isArray) {
    if (
      node.arrayElementInfo &&
      (node.arrayElementInfo.presenceCount > 0 ||
        node.arrayElementInfo.primitiveTypes.size > 0 ||
        node.arrayElementInfo.stringLiterals.size > 0 ||
        node.arrayElementInfo.isObject ||
        node.arrayElementInfo.isArray)
    ) {
      const elementTypeString = generateTypeString(node.arrayElementInfo, indentation); // Recursive call
      // Add parentheses if element type is complex
      if (
        elementTypeString.includes('|') ||
        elementTypeString.startsWith('{') ||
        elementTypeString.includes('&')
      ) {
        types.push(`(${elementTypeString})[]`);
      } else {
        types.push(`${elementTypeString}[]`);
      }
    } else {
      types.push('any[]');
    }
  }

  if (types.length === 0) {
    return 'any';
  } else if (types.length === 1) {
    return types[0];
  } else {
    return types.sort().join(' | ');
  }
}

/**
 * Generates TypeScript global variable declarations (`declare var name: type;`)
 * for each top-level property found in the input objects that is a valid identifier.
 * The type represents the deep, combined structure of that property's value, potentially
 * using string literal types for strings with few distinct values.
 * Keys that are not valid JavaScript identifiers are skipped.
 *
 * @param objects - The array of input objects.
 * @returns A string containing all the generated `declare var` statements, separated by newlines.
 * @throws {TypeError} If the input is not an array.
 */
export function generateGlobalVarDeclarations(
  objects: Record<string, any>[],
  maxKeysPerObject?: number
): string {
  if (!Array.isArray(objects)) {
    throw new TypeError('Input must be an array.');
  }
  if (objects.length === 0) {
    return '';
  }

  const topLevelPropertyNodes = new Map<string, TypeInfoNode>();
  let validObjectCount = 0;

  for (const obj of objects) {
    if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
      validObjectCount++;
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          if (!topLevelPropertyNodes.has(key)) {
            topLevelPropertyNodes.set(key, createTypeInfoNode());
          }
          const propertyRootNode = topLevelPropertyNodes.get(key)!;
          aggregateTypeInfo(obj[key], propertyRootNode, 1);
        }
      }
    }
  }

  if (validObjectCount === 0) {
    return '';
  }

  const declarations: string[] = [];
  const sortedKeys = Array.from(topLevelPropertyNodes.keys()).sort();

  for (const key of sortedKeys) {
    if (validIdentifierRegex.test(key)) {
      const propertyNode = topLevelPropertyNodes.get(key)!;
      propertyNode.parentObjectCount = propertyNode.presenceCount; // Set for type generation

      const typeString = generateTypeString(propertyNode, undefined, maxKeysPerObject);

      if (typeString !== 'any' || propertyNode.presenceCount > 0) {
        declarations.push(`declare var ${key}: ${typeString};`);
      }
    }
  }

  return declarations.join('\n\n');
}

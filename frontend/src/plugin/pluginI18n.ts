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

import i18next, { createInstance, i18n, TFunction, TOptions } from 'i18next';
import { useEffect, useState } from 'react';
import { useTranslation as useReactI18nTranslation } from 'react-i18next';
import { getAppUrl } from '../helpers/getAppUrl';

export interface PluginTranslations {
  [locale: string]: {
    [key: string]: string;
  };
}

export interface PluginI18nInfo {
  name: string;
  translations: PluginTranslations;
}

export interface UseTranslationResult {
  /** Translation function */
  t: TFunction;
  /** i18next instance for the plugin */
  i18n: i18n | null;
  /** Whether translations are ready */
  ready: boolean;
}

export interface PluginPackageInfo {
  name: string;
  headlamp?: {
    i18n?: string[]; // Array of supported locales
  };
  [key: string]: unknown;
}

// Store for plugin i18n instances and their paths
const pluginI18nInstances: { [pluginName: string]: i18n } = {};
const pluginPaths: { [pluginName: string]: string } = {};
const pluginSupportedLocales: { [pluginName: string]: string[] } = {};

/**
 * Load translations for a plugin from its directory
 * Always looks in the same directory as package.json: {pluginPath}/locales/{locale}/translation.json
 */
async function loadPluginTranslations(
  pluginPath: string,
  locale: string
): Promise<Record<string, string>> {
  try {
    const response = await fetch(`${getAppUrl()}${pluginPath}/locales/${locale}/translation.json`);
    if (response.ok) {
      return response.json();
    }
  } catch (error) {
    // Translation file doesn't exist for this locale
  }

  return {};
}

/**
 * Create or get an i18next instance for a plugin
 * Uses hard defaults: namespace = plugin name, loads from plugin path
 */
async function getPluginI18nInstance(
  pluginName: string,
  pluginPath: string,
  supportedLocales?: string[]
): Promise<i18n> {
  if (pluginI18nInstances[pluginName]) {
    return pluginI18nInstances[pluginName];
  }

  const instance = createInstance();

  // Use supported locales from package.json or fall back to common locales
  const locales = supportedLocales || ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ko', 'ja'];
  const resources: Record<string, Record<string, Record<string, string>>> = {};

  // Load translations for each locale that exists
  for (const locale of locales) {
    const translations = await loadPluginTranslations(pluginPath, locale);
    if (Object.keys(translations).length > 0) {
      resources[locale] = {
        [pluginName]: translations,
      };
    }
  }

  // If English is not in the supported locales but is the fallback language,
  // provide an empty English resource to prevent warnings when no English
  // translation file exists. This allows plugins to use their default strings
  // (which may already be in English) without requiring explicit English translations.
  const hasEnglishTranslations = resources['en'] !== undefined;
  const supportsEnglish = supportedLocales?.includes('en') ?? true;

  if (!hasEnglishTranslations && !supportsEnglish) {
    // Provide empty English translations to prevent i18next warnings
    // This allows the plugin to fall back to its original string keys
    resources['en'] = {
      [pluginName]: {},
    };
  }

  await instance.init({
    lng: i18next.language || 'en',
    fallbackLng: 'en',
    defaultNS: pluginName,
    ns: [pluginName],
    resources,
    interpolation: {
      escapeValue: false,
    },
    // Disable debug warnings for plugins that don't explicitly support English
    // This prevents warnings about missing English translations when plugins
    // may already have English strings as their default content
    debug: false,
    // Always return the key if no translation is found, which works well
    // for plugins that already have English strings as their keys/content
    returnEmptyString: false,
    // Don't save missing keys to avoid console noise
    saveMissing: false,
  });

  pluginI18nInstances[pluginName] = instance;
  return instance;
}

/**
 * Register translations for a plugin programmatically
 * @deprecated This function is deprecated. Use automatic translation file detection instead.
 * Just place translation files in locales/{language}/translation.json and use useTranslation().
 */
export function registerPluginTranslations(pluginName: string, translations: PluginTranslations) {
  console.warn(
    `registerPluginTranslations is deprecated. Plugin ${pluginName} should use automatic translation loading instead.`
  );

  const instance = createInstance();
  const namespace = pluginName;

  instance.init({
    lng: i18next.language || 'en',
    fallbackLng: 'en',
    defaultNS: namespace,
    ns: [namespace],
    resources: Object.keys(translations).reduce((acc, locale) => {
      acc[locale] = {
        [namespace]: translations[locale],
      };
      return acc;
    }, {} as Record<string, Record<string, Record<string, string>>>),
    interpolation: {
      escapeValue: false,
    },
    debug: false,
    returnEmptyString: false,
    saveMissing: false,
  });

  pluginI18nInstances[pluginName] = instance;
}

/**
 * Hook to use translations in a plugin
 * Automatically detects the plugin name from the build-time injected constants
 * @param pluginNameParam Plugin name (automatically injected by build system)
 */
export function useTranslation(pluginNameParam?: string): UseTranslationResult {
  const [ready, setReady] = useState(false);
  const [instance, setInstance] = useState<i18n | null>(null);
  const [pluginName] = useState(() => {
    if (pluginNameParam) {
      return pluginNameParam;
    }

    // If no plugin name is provided, it means the build system transformation didn't work
    console.error(
      'useTranslation: No plugin name provided. This usually means the build system transformation failed.'
    );
    return null;
  });
  const { i18n: mainI18n } = useReactI18nTranslation();

  // Initialize plugin translations when plugin name is available
  useEffect(() => {
    async function initializeTranslations() {
      if (!pluginName) {
        console.error('useTranslation: No plugin name available. Plugin i18n will not work.');
        setReady(true);
        return;
      }

      try {
        const currentPluginName = pluginName;

        // Try to resolve the plugin path. Use the module-level pluginPaths mapping.
        let pluginPath = pluginPaths[currentPluginName];

        // As a last resort, try deriving a path from the package name by
        // stripping the scope (if any) to match common directory setups.
        if (!pluginPath && currentPluginName) {
          const unscoped = currentPluginName.includes('/')
            ? currentPluginName.split('/').slice(-1)[0]
            : currentPluginName;
          // Common plugin path shape is "/plugins/<name>"
          const derived = `/plugins/${unscoped}`;
          // We don't have a server filesystem check here; try to use the
          // derived path optimistically. It will fail later when fetching
          // translations, but gives us a chance to proceed.
          pluginPath = derived;
        }

        if (!pluginPath) {
          console.warn(
            `No plugin path found for ${currentPluginName}. i18n initialization skipped.`
          );
          setReady(true);
          return;
        }

        // Initialize plugin i18n instance
        const supportedLocales = pluginSupportedLocales[currentPluginName];
        const pluginInstance = await getPluginI18nInstance(
          currentPluginName,
          pluginPath,
          supportedLocales
        );
        setInstance(pluginInstance);
        setReady(true);
      } catch (error) {
        console.error(`Failed to initialize translations for plugin ${pluginName}:`, error);
        setReady(true); // Set ready to true even on error to prevent hanging
      }
    }

    initializeTranslations();
  }, [pluginName]);

  // Sync language changes from main i18n
  useEffect(() => {
    if (instance && mainI18n?.language !== instance.language) {
      instance.changeLanguage(mainI18n.language);
    }
  }, [mainI18n?.language, instance]);

  // Translation function
  const t = (key: string, options?: TOptions) => {
    // Avoid flashing the raw key in the UI before plugin translations are ready.
    // While the plugin i18n instance is initializing (ready === false)
    // return an empty string to avoid briefly showing the key.
    if (!ready) {
      return '';
    }

    // If initialization completed but we don't have an instance (for
    // example the plugin has no translations or initialization failed),
    // return the original key so the UI still shows a reasonable value.
    if (!instance || !pluginName) {
      return key;
    }

    return instance.t(key, options);
  };

  return {
    t: t as TFunction,
    i18n: instance,
    ready,
  };
}

/**
 * Get all registered plugin translations info
 */
export function getPluginTranslationsInfo(): PluginI18nInfo[] {
  return [];
}

/**
 * Change language for all plugin instances
 */
export function changePluginLanguage(language: string) {
  Object.values(pluginI18nInstances).forEach(instance => {
    instance.changeLanguage(language);
  });
}

/**
 * Check if a locale is supported by a plugin
 */
export function isLocaleSupported(pluginName: string, locale: string): boolean {
  const supportedLocales = pluginSupportedLocales[pluginName];
  return Array.isArray(supportedLocales) && supportedLocales.includes(locale);
}

/**
 * Get the list of supported locales for a plugin
 */
export function getSupportedLocales(pluginName: string): string[] {
  return pluginSupportedLocales[pluginName] || [];
}

/**
 * Initialize plugin i18n - simplified approach using package.json configuration
 * This is called automatically during plugin loading
 */
export async function initializePluginI18n(
  pluginName: string,
  packageInfo: PluginPackageInfo,
  pluginPath: string
) {
  // Store the plugin path for later use by useTranslation hook
  pluginPaths[pluginName] = pluginPath;

  // Detect duplicate pluginPath mappings: if another plugin name already
  // points to the same path, warn because translations may be loaded from
  // the wrong folder and cause cross-plugin leaks.
  const duplicates = Object.keys(pluginPaths).filter(
    name => name !== pluginName && pluginPaths[name] === pluginPath
  );
  if (duplicates.length > 0) {
    console.warn(
      `Plugin path collision: ${pluginName} and ${duplicates.join(
        ', '
      )} map to the same path ${pluginPath}`
    );
  }

  // Check if plugin has i18n enabled in package.json (array of supported locales)
  const i18nConfig = packageInfo.headlamp?.i18n;
  let supportedLocales: string[] = [];
  let i18nEnabled = false;

  if (Array.isArray(i18nConfig)) {
    // Array of supported locales
    supportedLocales = i18nConfig;
    i18nEnabled = supportedLocales.length > 0;
  }

  if (i18nEnabled) {
    // Store supported locales for later use
    pluginSupportedLocales[pluginName] = supportedLocales;
    console.log(
      `Initializing i18n for plugin ${pluginName} (supported locales: ${supportedLocales.join(
        ', '
      )})`
    );
    try {
      await getPluginI18nInstance(pluginName, pluginPath, supportedLocales);
    } catch (error) {
      console.error(`Failed to initialize i18n for plugin ${pluginName}:`, error);
    }
  } else {
    console.log(`Plugin ${pluginName} does not have i18n enabled in package.json`);
  }
}

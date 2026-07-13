/**
 * Vite plugin to inject plugin name and transform useTranslation imports
 * Automatically injects plugin name into useTranslation calls
 */
import fs from 'fs';
import path from 'path';

export function pluginNameInjection() {
  let pluginName = null;

  return {
    name: 'plugin-name-injection',

    // Find plugin name during build start
    buildStart() {
      // Find the closest package.json to determine plugin name
      let currentDir = process.cwd();

      while (currentDir !== path.parse(currentDir).root) {
        const packageJsonPath = path.join(currentDir, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            pluginName = packageJson.name;
            console.log(`🎯 Plugin name detected: '${pluginName}'`);
            break;
          } catch (error) {
            // Continue searching
          }
        }
        currentDir = path.dirname(currentDir);
      }
    },

    // Transform code to inject plugin name into useTranslation calls
    transform(code, id) {
      // Only transform TypeScript/JavaScript files that import useTranslation
      if (!/\.(tsx?|jsx?)$/.test(id)) return null;
      if (!code.includes('useTranslation')) return null;

      // Determine plugin name: prefer the name found at buildStart, but if not
      // available (for example when build CWD is different), walk up from the
      // transformed file's path (`id`) and read the closest package.json.
      let localPluginName = pluginName;
      if (!localPluginName) {
        let currentDir = path.dirname(id);
        while (currentDir && currentDir !== path.dirname(currentDir)) {
          const packageJsonPath = path.join(currentDir, 'package.json');
          if (fs.existsSync(packageJsonPath)) {
            try {
              const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
              if (packageJson && packageJson.name) {
                localPluginName = packageJson.name;
                console.log(
                  `🎯 Plugin name detected from '${path.relative(
                    process.cwd(),
                    id
                  )}': '${localPluginName}'`
                );
                break;
              }
            } catch (error) {
              // ignore and continue walking up
            }
          }
          currentDir = path.dirname(currentDir);
        }
      }

      if (!localPluginName) return null;

      // Transform useTranslation/registerPluginSettings calls using the resolved name
      let transformedCode = code;
      let hasTransformations = false;

      const nameLiteral = JSON.stringify(localPluginName);

      // Transform useTranslation() calls without parameters
      const useTranslationMatches = transformedCode.match(/\buseTranslation\(\s*\)/g);
      if (useTranslationMatches) {
        console.log(`🔄 Found ${useTranslationMatches.length} useTranslation() calls to transform`);
        transformedCode = transformedCode.replace(
          /\buseTranslation\(\s*\)/g,
          `useTranslation(${nameLiteral})`
        );
        hasTransformations = true;
      }

      if (hasTransformations) {
        console.log(`🔄 Transformed useTranslation() calls in ${path.relative(process.cwd(), id)}`);
        return transformedCode;
      }

      return null;
    },
  };
}

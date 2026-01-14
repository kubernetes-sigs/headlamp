# i18n Internationalization / Localization

We try and keep all the i18n related things in here.

## For Translators

See the [i18n contributing guide](../../../docs/development/i18n/contributing.md) for a complete guide on how to contribute translations.

### Quick Commands

```bash
npm run i18n:status        # Show translation status for all languages
npm run i18n:list          # List all translation files with completion status
npm run i18n:list -- de    # List translation files for German with completion status
```

**Note:** These commands are run from the project root directory.

## Translation File Location

**⚠️ IMPORTANT:** All translations should be edited in:

```
frontend/src/i18n/locales/
```

This is the **single source of truth** for all Headlamp translations. Do not edit translation files in other locations (like `plugins/headlamp-plugin/src/i18n/locales/`) as they are auto-generated.

## For Developers

See the [i18n docs](../../docs/development/i18n.md) for full technical details.

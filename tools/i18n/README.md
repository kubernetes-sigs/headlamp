# I18n Tool

A TypeScript tool to help translators work with Headlamp's internationalization files.

## Features

- **Status**: View translation completion status for all languages with progress bars
- **List**: Show all translation files with completion percentages and detect missing files

## Usage from Project Root

From the Headlamp project root, use the npm scripts:

```bash
npm run i18n:status       # Show translation status overview
npm run i18n:list         # List all translation files with completion
npm run i18n:list -- es   # List files for specific language (e.g., Spanish)
```

## Development

### Running Locally

```bash
# From tools/i18n directory
npm run status
npm run list       # All languages
npm run list -- zh # Specific language
```

The tool runs directly with ts-node, no build step needed.

## Translation File Location

All translation files are located in: `frontend/src/i18n/locales/`

This is the single source of truth for all translations. Translation files in other locations (like `plugins/headlamp-plugin/`) are auto-generated during the build process.

## Deprecation of Old Tools

This tool replaces the old scripts in `frontend/src/i18n/tools/`:
- `copy-translations.js` → Use `npm run i18n:copy`
- `extract-empty-translations.js` → Use `npm run i18n:extract`

The old scripts are deprecated and should no longer be used.

## For More Information

See `docs/development/i18n/contributing.md` for complete translator documentation.

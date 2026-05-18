# I18n Tool

A TypeScript tool to help translators work with Headlamp's internationalization files.

## Features

- **Status**: View translation completion status for all languages with progress bars
- **List**: Show all translation files with completion percentages and detect missing files
- **Extract**: Extract empty translations to a separate file for easy translation
- **Copy**: Copy translations from one file to another (with options to force overwrite or copy all)

## Usage from Project Root

From the Headlamp project root, use the npm scripts:

```bash
# View translation status
npm run i18n:status

# List translation files
npm run i18n:list         # All languages
npm run i18n:list -- es   # Specific language (e.g., Spanish)

# Extract empty translations for easier translation
npm run i18n:extract -- frontend/src/i18n/locales/de/translation.json

# Copy translations between files
npm run i18n:copy -- source.json dest.json           # Copy only missing translations
npm run i18n:copy -- source.json dest.json --force   # Overwrite all translations
npm run i18n:copy -- source.json dest.json --all     # Copy even keys not in dest
```

## Development

### Running Locally

```bash
# From tools/i18n directory
npm run status
npm run list       # All languages
npm run list -- zh # Specific language
npm run extract -- ../../../frontend/src/i18n/locales/de/translation.json
npm run copy -- source.json dest.json
```

The tool runs directly with ts-node, no build step needed.

### Running Tests

```bash
# From tools/i18n directory
npm install    # Install dependencies first

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

The test suite includes comprehensive end-to-end tests for:
- All CLI commands (status, list, extract, copy)
- Command options (--force, --all)
- Error handling (missing files, malformed JSON)
- Edge cases (empty files, path resolution)
- Help and usage documentation

Tests run the CLI as a subprocess to test the real user experience.

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

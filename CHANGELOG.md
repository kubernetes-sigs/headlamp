# Changelog

## Unreleased

### Added
- Environment variables access for plugins through `Headlamp.getEnv()` method
- Safe exposure of environment variables with `REACT_APP_` prefix to plugins

### Fixed
- Issue where plugins did not have access to environment variables
- Plugins can now access environment variables without needing direct access to the `process` object

## Previous versions
(Previous changelog entries would be here)
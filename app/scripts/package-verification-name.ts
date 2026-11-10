const { sanitizeFileName } = require('builder-util/out/filename.js');

/** Platform-specific electron-builder options used to name the packaged executable. */
interface PlatformBuildMetadata {
  /** Executable filename override for this platform. */
  executableName?: string | null;
}

/** electron-builder options that affect packaged product and executable names. */
interface PackageBuildMetadata extends PlatformBuildMetadata {
  /** Product name used when no executable name is configured. */
  productName?: string;
  /** Linux-specific build options. */
  linux?: PlatformBuildMetadata;
  /** macOS-specific build options. */
  mac?: PlatformBuildMetadata;
  /** Windows-specific build options. */
  win?: PlatformBuildMetadata;
}

/** npm package metadata consumed by the build verification scripts. */
interface PackageMetadata {
  /** npm package name and Linux executable-name fallback. */
  name: string;
  /** Product name declared outside the electron-builder configuration. */
  productName?: string;
  /** electron-builder configuration from the package manifest. */
  build?: PackageBuildMetadata;
}

/** electron-builder platform keys supported by the verification scripts. */
type VerificationPlatform = 'linux' | 'mac' | 'win';

/**
 * Resolves the product-name fallback using electron-builder's metadata precedence.
 *
 * @param packageMetadata - The npm package and electron-builder metadata.
 * @returns The configured product name, or the npm package name.
 */
function getProductName(packageMetadata: PackageMetadata): string {
  return packageMetadata.build?.productName || packageMetadata.productName || packageMetadata.name;
}

/**
 * Resolves a platform executable override before the shared executable name.
 *
 * @param packageMetadata - The npm package and electron-builder metadata.
 * @param platform - The electron-builder platform key being verified.
 * @returns The configured executable name, when present.
 */
function getExecutableName(
  packageMetadata: PackageMetadata,
  platform: VerificationPlatform
): string | null | undefined {
  return packageMetadata.build?.[platform]?.executableName ?? packageMetadata.build?.executableName;
}

/**
 * Derives the filename that a platform build verification script should locate.
 *
 * Names are sanitized with electron-builder's filename rules. Linux defaults to
 * a lowercase npm package name, macOS uses the product-name fallback, and Windows
 * appends `.exe`.
 *
 * @param packageMetadata - The npm package and electron-builder metadata.
 * @param platform - The platform whose packaged executable is being verified.
 * @returns The packaged executable filename, or an empty string for invalid metadata.
 */
function derivePackageVerificationName(
  packageMetadata: PackageMetadata,
  platform: VerificationPlatform
): string {
  const executableName = getExecutableName(packageMetadata, platform);

  if (platform === 'linux') {
    return executableName == null
      ? sanitizeFileName(packageMetadata.name).toLowerCase()
      : sanitizeFileName(executableName);
  }

  const name = sanitizeFileName(executableName ?? getProductName(packageMetadata));
  if (!name) {
    return '';
  }

  return platform === 'win' ? `${name}.exe` : name;
}

module.exports = { derivePackageVerificationName };

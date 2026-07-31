const { sanitizeFileName } = require('builder-util/out/filename.js');

function getProductName(packageMetadata) {
  return packageMetadata.build?.productName || packageMetadata.productName || packageMetadata.name;
}

function getExecutableName(packageMetadata, platform) {
  return packageMetadata.build?.[platform]?.executableName ?? packageMetadata.build?.executableName;
}

function derivePackageVerificationName(packageMetadata, platform) {
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

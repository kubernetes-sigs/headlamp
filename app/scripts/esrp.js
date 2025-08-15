/**
 * This script is used to sign and notarize the Headlamp app for MacOS
 * using a tool from ESRP (Windows only). It is mainly called from CI.
 *
 * Usage: node esrp.js apple-sign|apple-notarize|windows-sign path-to-sign
 **/

const crypto = require('crypto');
const { execFileSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const SIGN_JSON_TEMPLATE = {
  Version: '1.0.0',
  DriEmail: [`${process.env.HEADLAMP_WINDOWS_SIGN_EMAIL}`],
  GroupId: null,
  CorrelationVector: null,
  SignBatches: [],
};

const POLICY_JSON = {
  Version: '1.0.0',
  Intent: '',
  ContentType: '',
  ContentOrigin: '',
  ProductState: '',
  Audience: '',
};

const AUTH_JSON = {
  Version: '1.0.0',
  AuthenticationType: 'AAD_CERT',
  ClientId: `${process.env.HEADLAMP_WINDOWS_CLIENT_ID}`,
  AuthCert: {
    SubjectName: `CN=${process.env.HEADLAMP_WINDOWS_CLIENT_ID}.microsoft.com`,
    StoreLocation: 'LocalMachine',
    StoreName: 'My',
    SendX5c: 'true',
  },
  RequestSigningCert: {
    SubjectName: `CN=${process.env.HEADLAMP_WINDOWS_CLIENT_ID}`,
    StoreLocation: 'LocalMachine',
    StoreName: 'My',
  },
};

function getFileList(rootDir) {
  let files = {};
  let dirs = ['.'];
  while (dirs.length > 0) {
    const dirName = dirs.shift();
    const curDir = path.join(rootDir, dirName);

    fs.readdirSync(curDir).forEach(file => {
      if (['node_modules', '.git'].includes(file)) {
        return;
      }
      const filepath = path.resolve(rootDir, dirName, file);
      const stat = fs.statSync(filepath);
      if (stat.isDirectory() && !files[file]) {
        dirs.push(path.join(dirName, file));
        files[file] = [];
      } else {
        if (!files[dirName]) {
          files[dirName] = [];
        }

        files[dirName].push({
          path: file,
          hash: getSHA256(filepath),
        });
      }
    });
  }
  return files;
}

function getSHA256(filePath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);

  hash.update(data);
  return hash.digest('hex');
}

const macSignOp = {
  KeyCode: 'CP-401337-Apple',

  OperationCode: 'MacAppDeveloperSign',
  Parameters: {
    Hardening: '--options=runtime',
  },
  ToolName: 'sign',

  ToolVersion: '1.0',
};
const macNotarizeOp = {
  KeyCode: 'CP-401337-Apple',
  OperationCode: 'MacAppNotarize',
  Parameters: {
    BundleId: 'com.microsoft.Headlamp',
  },
  ToolName: 'sign',
  ToolVersion: '1.0',
};

const winSignOps = [
  {
    KeyCode: 'CP-231522',
    OperationCode: 'SigntoolSign',
    Parameters: {
      OpusName: 'Microsoft',
      OpusInfo: 'http://www.microsoft.com',
      Append: '/as',
      FileDigest: '/fd "SHA256"',
      PageHash: '/NPH',
      TimeStamp: '/tr "http://rfc3161.gtm.corp.microsoft.com/TSS/HttpTspServer" /td sha256',
    },
    ToolName: 'sign',
    ToolVersion: '1.0',
  },
  {
    KeyCode: 'CP-231522',
    OperationCode: 'SigntoolVerify',
    Parameters: {},
    ToolName: 'sign',
    ToolVersion: '1.0',
  },
];

function createMacSignJson(pathToSign, fileName = 'test_SignInput.json') {
  return createJson(pathToSign, [macSignOp], fileName);
}

function createMacNotarizeJson(pathToSign, fileName = 'test_SignInput.json') {
  return createJson(pathToSign, [macNotarizeOp], fileName);
}

function createWinSignJson(pathToSign, fileName = 'test_SignInput.json') {
  return createJson(pathToSign, winSignOps, fileName);
}

function createJson(pathToSign, op, fileName = 'test_SignInput.json') {
  let rootDir = pathToSign;
  let files = {};

  // Check if we are signing one single file or all files in a directory
  const stat = fs.statSync(pathToSign);
  if (stat.isFile()) {
    rootDir = path.dirname(pathToSign);
    files = {
      '.': [
        {
          path: path.basename(pathToSign),
          hash: getSHA256(pathToSign),
        },
      ],
    };
  } else {
    files = getFileList(pathToSign);
  }

  const filesJson = (dir, files) => {
    return {
      SourceLocationType: 'UNC',
      SourceRootDirectory: path.resolve(rootDir, dir),
      SignRequestFiles: files.map(f => ({
        SourceLocation: f.path,
        SourceHash: f.hash ?? '',
        HashType: (f.hash && 'SHA256') || null,
        Name: f.path,
      })),
      SigningInfo: {
        Operations: [...op],
      },
    };
  };

  SIGN_JSON_TEMPLATE.SignBatches = Object.keys(files)
    .map(dir => filesJson(dir, files[dir]))
    .filter(f => f.SignRequestFiles.length > 0);
  const filePath = path.join(os.tmpdir(), fileName);
  fs.writeFileSync(filePath, JSON.stringify(SIGN_JSON_TEMPLATE, undefined, 2));

  return filePath;
}

const SIGN_OPS = {
  APPLE_SIGN: 'apple-sign',
  APPLEN_OTARIZE: 'apple-notarize',
  WINDOWS_SIGN: 'windows-sign',
};

/**
 * Signs the given file, or all files in a given directory if that's what's passed to it.
 * @param esrpTool - The path to the ESRP tool.
 * @param op - The operation to perform. Either 'SIGN' or 'NOTARIZE'.
 * @param pathToSign - A path to a file or directory.
 */
function sign(esrpTool, op, pathToSign) {
  const absPathToSign = path.resolve(pathToSign);
  const signJsonBase = path.basename(absPathToSign).split('.')[0];
  let signInputJson = '';
  if (op === SIGN_OPS.APPLE_SIGN) {
    signInputJson = createMacSignJson(absPathToSign, `${signJsonBase}-SignInput.json`);
  } else if (op === SIGN_OPS.APPLEN_OTARIZE) {
    signInputJson = createMacNotarizeJson(absPathToSign, `${signJsonBase}-SignInput.json`);
  } else if (op === SIGN_OPS.WINDOWS_SIGN) {
    signInputJson = createWinSignJson(absPathToSign, `${signJsonBase}-SignInput.json`);
  } else {
    throw new Error('Invalid operation. The options are:', SIGN_OPS.join(', '));
  }

  const policyJson = path.resolve(os.tmpdir(), 'Policy.json');
  fs.writeFileSync(policyJson, JSON.stringify(POLICY_JSON, undefined, 2));
  const authJson = path.resolve(os.tmpdir(), 'Auth.json');
  fs.writeFileSync(authJson, JSON.stringify(AUTH_JSON, undefined, 2));

  try {
    execFileSync(esrpTool, [
      'Sign',
      '-l',
      'Verbose',
      '-a',
      authJson,
      '-p',
      policyJson,
      '-i',
      signInputJson,
    ]);
  } catch (e) {
    console.error('Failed to sign:', e);
    process.exit(e.status !== null ? e.status ?? 1 : 1);
  }
}

module.exports = {
  sign,
  SIGN_OPS,
};

if (require.main === module) {
  const wantedOp = process.argv[2];
  const pathToSign = process.argv[3];
  sign(process.env.ESRP_PATH, wantedOp, pathToSign);
  process.exit(0);
}

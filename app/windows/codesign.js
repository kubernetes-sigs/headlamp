const { execFile } = require('child_process');
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

        files[dirName].push(file);
      }
    });
  }
  return files;
}

function createJson(pathToSign, fileName = 'test_SignInput.json') {
  let rootDir = pathToSign;
  let files = {};

  // Check if we are signing one single file or all files in a directory
  const stat = fs.statSync(pathToSign);
  if (stat.isFile()) {
    rootDir = path.dirname(pathToSign);
    files = { '.': [path.basename(pathToSign)] };
  } else {
    files = getFileList(pathToSign);
  }

  const filesJson = (dir, files) => {
    return {
      SourceLocationType: 'UNC',
      SourceRootDirectory: path.resolve(rootDir, dir),
      SignRequestFiles: files.map(f => ({
        SourceLocation: f,
        SourceHash: '',
        HashType: null,
        Name: f,
      })),
      SigningInfo: {
        Operations: [
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
        ],
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

/**
 * Signs the given file, or all files in a given directory if that's what's passed to it.
 * @param esrpTool - The path to the ESRP tool.
 * @param pathToSign - A path to a file or directory.
 */
function sign(esrpTool, pathToSign) {
  if (!process.env.HEADLAMP_WINDOWS_CLIENT_ID) {
    throw 'No HEADLAMP_WINDOWS_CLIENT_ID env var defined!';
  }

  const signJsonBase = path.basename(pathToSign).split('.')[0];
  const signInputJson = createJson(pathToSign, `${signJsonBase}-SignInput.json`);

  const policyJson = path.resolve(os.tmpdir(), 'Policy.json');
  fs.writeFileSync(policyJson, JSON.stringify(POLICY_JSON, undefined, 2));

  const authJson = path.resolve(os.tmpdir(), 'Auth.json');
  fs.writeFileSync(authJson, JSON.stringify(AUTH_JSON, undefined, 2));

  execFile(
    esrpTool,
    ['Sign', '-a', authJson, '-p', policyJson, '-i', signInputJson],
    (error, stdout, stderr) => {
      if (error) {
        console.log(`error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.log(`stderr: ${stderr}`);
        return;
      }
      console.log(`stdout: ${stdout}`);
    }
  );
}

module.exports = {
  sign,
};

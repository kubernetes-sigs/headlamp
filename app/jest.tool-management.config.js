/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/electron'],
  testMatch: ['**/tool-management.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json'
      }
    ]
  },
  moduleNameMapper: {
    '^electron$': '<rootDir>/node_modules/electron'
  },
  setupFilesAfterEnv: ['<rootDir>/electron/__tests__/setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testTimeout: 30000
};

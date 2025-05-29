/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/tool-management.test.ts'
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'electron/tsconfig.json'
    }]
  },
  moduleNameMapper: {
    '^electron$': '<rootDir>/node_modules/electron'
  }
};

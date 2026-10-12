module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  clearMocks: true,
  // node:sqlite emits an ExperimentalWarning on Node 22/24; keep output readable
  // without hiding real failures.
  silent: false,
  collectCoverageFrom: ['src/**/*.js'],
};

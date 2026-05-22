module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', esModuleInterop: true } }],
  },
  moduleNameMapper: {
    '^@anthropic-ai/sdk$': '<rootDir>/__tests__/__mocks__/@anthropic-ai/sdk.ts',
  },
};

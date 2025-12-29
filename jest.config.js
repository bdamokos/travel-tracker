import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: process.env.JEST_INTEGRATION_TESTS ? 'node' : 'jsdom',
  testMatch: process.env.JEST_INTEGRATION_TESTS 
    ? ['**/__tests__/integration/**/*.(ts|tsx|js)', '**/__tests__/**/*.integration.(ts|tsx|js)', '**/__tests__/**/*.integration.test.(ts|tsx|js)']
    : ['**/__tests__/**/*.(ts|tsx|js)', '**/*.(test|spec).(ts|tsx|js)', '!**/__tests__/integration/**/*', '!**/__tests__/**/*.integration.(ts|tsx|js)', '!**/__tests__/**/*.integration.test.(ts|tsx|js)', '!**/*.integration.(ts|tsx|js)', '!**/*.integration.test.(ts|tsx|js)', '!**/*.demo.(ts|tsx|js)', '!**/__tests__/utils/**/*.(ts|tsx|js)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
  ],
  ...(process.env.JEST_INTEGRATION_TESTS ? {
    globalSetup: '<rootDir>/jest.integration.setup.js',
    globalTeardown: '<rootDir>/jest.integration.teardown.js'
  } : {})
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(customJestConfig)

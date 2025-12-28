import { rm } from 'fs/promises';

export default async function globalTeardown(globalConfig) {
  if (!process.env.JEST_INTEGRATION_TESTS) {
    return;
  }

  const { serverPid, dataDir } = globalConfig || {};

  if (serverPid) {
    try {
      process.kill(serverPid, 'SIGTERM');
    } catch (error) {
      console.warn('Could not terminate test dev server', error);
    }
  }

  if (dataDir) {
    try {
      await rm(dataDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up test data directory', error);
    }
  }
}

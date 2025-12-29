import { rm } from 'fs/promises';

export default async function globalTeardown() {
  if (!process.env.JEST_INTEGRATION_TESTS) {
    return;
  }

  const serverPid = process.env.TEST_SERVER_PID ? parseInt(process.env.TEST_SERVER_PID, 10) : null;
  const dataDir = process.env.TEST_DATA_DIR;

  if (serverPid) {
    try {
      const killTarget = process.platform === 'win32' ? serverPid : -serverPid;
      process.kill(killTarget, 'SIGTERM');

      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        process.kill(killTarget, 0);
        process.kill(killTarget, 'SIGKILL');
      } catch {
        // Process already terminated
      }
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

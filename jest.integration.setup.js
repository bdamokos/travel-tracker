import { spawn, spawnSync } from 'child_process';
import { mkdtemp, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import net from 'net';
import { join } from 'path';

function resolveDevServerCommand() {
  const bunCheck = spawnSync('bun', ['--version'], { stdio: 'ignore' });
  if (!bunCheck.error) {
    return { command: 'bun', argsPrefix: ['run'] };
  }

  return { command: 'npm', argsPrefix: ['run'] };
}

async function findAvailablePort() {
  return await new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.once('error', reject);
    tester.listen(0, '127.0.0.1', () => {
      const address = tester.address();
      const port = typeof address === 'object' && address ? address.port : null;
      tester.close(() => {
        if (typeof port === 'number') {
          resolve(port);
          return;
        }
        reject(new Error('Could not find an available port for the test server'));
      });
    });
  });
}

async function waitForServer(baseUrl, child) {
  const timeoutAt = Date.now() + 90_000;
  let lastError;

  while (Date.now() < timeoutAt) {
    if (child?.exitCode !== null) {
      throw new Error(`Test dev server exited early with code ${child.exitCode}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/travel-data/list`);
      if (response.ok || response.status === 404 || response.status === 400) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for test dev server: ${lastError}`);
}

export default async function globalSetup() {
  if (!process.env.JEST_INTEGRATION_TESTS) {
    return undefined;
  }

  const dataDir = await mkdtemp(join(tmpdir(), 'travel-tracker-data-'));
  await mkdir(join(dataDir, 'backups'), { recursive: true });

  const port = await findAvailablePort();
  const baseUrl = `http://localhost:${port}`;

  const serverEnv = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'test',
    NEXT_TELEMETRY_DISABLED: '1',
    PORT: String(port),
    TEST_API_BASE_URL: baseUrl,
    TEST_DATA_DIR: dataDir
  };

  const { command, argsPrefix } = resolveDevServerCommand();
  const devServer = spawn(command, [...argsPrefix, 'dev', '--', '--hostname', 'localhost', '--port', String(port)], {
    env: serverEnv,
    stdio: 'pipe',
    detached: true
  });

  devServer.stdout?.on('data', (data) => {
    process.stdout.write(data);
  });
  devServer.stderr?.on('data', (data) => {
    process.stderr.write(data);
  });

  await waitForServer(baseUrl, devServer);

  process.env.TEST_API_BASE_URL = baseUrl;
  process.env.TEST_DATA_DIR = dataDir;
  process.env.TEST_SERVER_PID = String(devServer.pid);

  return {
    serverPid: devServer.pid,
    port,
    dataDir
  };
}

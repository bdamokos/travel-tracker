/** @jest-environment node */

import { spawnSync } from 'child_process';
import {
  chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync,
  readFileSync, readdirSync, readlinkSync, renameSync, rmSync, statSync,
  symlinkSync, writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('worktree helper main-repository configuration preservation', () => {
  let fixture: string;
  let repo: string;
  let target: string;
  let outside: string;
  let bin: string;
  let log: string;
  let script: string;

  beforeEach(() => {
    fixture = mkdtempSync(join(tmpdir(), 'travel-worktree-'));
    repo = join(fixture, 'main repo');
    target = join(repo, '.worktrees', 'feature', 'fixture');
    outside = join(fixture, 'outside checkout');
    bin = join(fixture, 'bin');
    log = join(fixture, 'commands');
    script = join(repo, 'deploy', 'start-worktree.sh');
    for (const dir of [join(repo, 'deploy'), join(target, 'deploy'), outside, bin]) {
      mkdirSync(dir, { recursive: true });
    }
    copyFileSync(join(process.cwd(), 'deploy', 'start-worktree.sh'), script);
    writeFileSync(join(repo, 'deploy', '.env'), 'SYNTHETIC_CONFIG=fixture-only\n');
    writeFileSync(join(outside, '.env'), 'outside bytes must stay unchanged\n');
    chmodSync(outside, 0o750);
    writeFileSync(log, '');

    // Git models the selected checkout already materialized by each fixture.
    // No real repository, branch, worktree, install, or network is touched.
    writeFileSync(join(bin, 'git'), `#!/bin/bash
set -eu
[[ "$1" == -C && ( "$2" == "$FIXTURE_REPO" || "$2" == "$FIXTURE_REPO/deploy" ) ]] || exit 90
shift 2
case "$*" in
  'rev-parse --show-toplevel') printf '%s\\n' "$FIXTURE_REPO" ;;
  'rev-parse --path-format=absolute --git-common-dir') printf '%s/.git\\n' "$FIXTURE_REPO" ;;
  'symbolic-ref --quiet --short HEAD') echo main ;;
  'show-ref --verify --quiet refs/heads/feature/fixture') exit "$FIXTURE_BRANCH_EXISTS" ;;
  worktree\\ add*) { printf 'git'; printf ' <%s>' "$@"; printf '\\n'; } >> "$FIXTURE_LOG" ;;
  *) exit 91 ;;
esac
`, { mode: 0o755 });
    writeFileSync(join(bin, 'bun'), `#!/bin/bash
{ printf 'bun'; printf ' <%s>' "$@"; printf '\\n'; } >> "$FIXTURE_LOG"
exit "\${FIXTURE_BUN_EXIT:-0}"
`, { mode: 0o755 });
  });

  afterEach(() => {
    // Also restore search permission after running the vulnerable baseline.
    chmodSync(outside, 0o750);
    const dest = join(target, 'deploy', '.env');
    if (existsSync(dest) && lstatSync(dest).isDirectory()) chmodSync(dest, 0o750);
    rmSync(fixture, { recursive: true, force: true });
  });

  const runHelper = (args = ['feature/fixture'], overrides: Record<string, string> = {}) =>
    spawnSync('/bin/bash', [script, ...args], {
      cwd: fixture,
      env: {
        PATH: `${bin}:/usr/bin:/bin`,
        FIXTURE_REPO: repo,
        FIXTURE_LOG: log,
        FIXTURE_BRANCH_EXISTS: '0',
        ...overrides,
      },
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 64 * 1024,
    });

  it.each(['directory symlink', 'relative directory symlink', 'chained directory symlink', 'dangling symlink', 'file symlink', 'regular file', 'directory', 'symlinked parent', 'absent'])(
    'leaves configuration and external filesystem untouched: %s',
    (kind) => {
      const dest = join(target, 'deploy', '.env');
      const externalEnv = join(outside, kind === 'symlinked parent' ? 'sentinel' : '.env');
      const missing = join(outside, 'missing');
      if (kind === 'directory symlink') symlinkSync(outside, dest);
      if (kind === 'relative directory symlink') symlinkSync('../../../../../outside checkout', dest);
      if (kind === 'chained directory symlink') {
        const intermediate = join(fixture, 'intermediate');
        symlinkSync(outside, intermediate);
        symlinkSync(intermediate, dest);
      }
      if (kind === 'dangling symlink') symlinkSync(missing, dest);
      if (kind === 'file symlink') symlinkSync(externalEnv, dest);
      if (kind === 'regular file') writeFileSync(dest, 'branch configuration\n');
      if (kind === 'directory') mkdirSync(dest);
      if (kind === 'symlinked parent') {
        renameSync(join(outside, '.env'), externalEnv);
        rmSync(join(target, 'deploy'), { recursive: true });
        symlinkSync(outside, join(target, 'deploy'));
      }
      const link = existsSync(dest) || kind === 'dangling symlink'
        ? lstatSync(dest).isSymbolicLink() ? readlinkSync(dest) : null
        : null;
      const result = runHelper();

      expect(readFileSync(externalEnv, 'utf8')).toBe('outside bytes must stay unchanged\n');
      expect(statSync(outside).mode & 0o777).toBe(0o750);
      expect(readdirSync(outside)).toEqual([kind === 'symlinked parent' ? 'sentinel' : '.env']);
      expect(existsSync(missing)).toBe(false);
      if (link !== null) expect(readlinkSync(dest)).toBe(link);
      if (kind === 'regular file') expect(readFileSync(dest, 'utf8')).toBe('branch configuration\n');
      if (kind === 'directory') expect(readdirSync(dest)).toEqual([]);
      if (kind === 'absent') expect(existsSync(dest)).toBe(false);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`Worktree ready at ${target}`);
      expect(existsSync(join(target, 'data', 'backups'))).toBe(true);
      expect(result.stdout).not.toContain('SYNTHETIC_CONFIG');
      expect(result.stdout).toContain('Main repository deploy/.env is not read, copied, or modified');
      expect(result.stdout).toContain('Bun retains its existing project environment-file behavior.');
    },
  );

  it('retains default target, existing branch, and lifecycle-disabled dependency setup', () => {
    const result = runHelper();
    expect(result.status).toBe(0);
    expect(readFileSync(log, 'utf8')).toBe(
      `git <worktree> <add> <${target}> <feature/fixture>\n` +
      `bun <install> <--cwd> <${target}> <--ignore-scripts>\n`,
    );
    expect(result.stdout).toContain(`Run 'cd ${target}' to enter the worktree.`);
  });

  it('documents the main-repository configuration boundary and retained Bun behavior in help', () => {
    const result = runHelper(['--help']);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("This helper does not read, copy, or modify the main\nrepository's deploy/.env.");
    expect(result.stdout).toContain("Bun's existing project environment-file behavior\nremains unchanged.");
    expect(readFileSync(log, 'utf8')).toBe('');
  });

  it('retains explicit target/base and new branch creation without Bun or source configuration', () => {
    const explicit = join(fixture, 'explicit checkout');
    rmSync(join(repo, 'deploy', '.env'));
    renameSync(join(bin, 'bun'), join(bin, 'unused-bun'));
    const result = runHelper(['feature/fixture', explicit, 'base/fixture'], { FIXTURE_BRANCH_EXISTS: '1' });
    expect(result.status).toBe(0);
    expect(readFileSync(log, 'utf8')).toBe(`git <worktree> <add> <-b> <feature/fixture> <${explicit}> <base/fixture>\n`);
    expect(existsSync(join(explicit, 'data', 'backups'))).toBe(true);
    expect(result.stdout).toContain('Bun not found; skipping dependency install.');
  });

  it('propagates dependency installation failures', () => {
    const result = runHelper(undefined, { FIXTURE_BUN_EXIT: '7' });
    expect(result.status).toBe(7);
    expect(result.stdout).not.toContain('Worktree ready');
    expect(existsSync(join(target, 'deploy', '.env'))).toBe(false);
  });

  it('works without reading an unreadable source configuration', () => {
    const source = join(repo, 'deploy', '.env');
    chmodSync(source, 0o000);
    const result = runHelper();
    expect(result.status).toBe(0);
    expect(statSync(source).mode & 0o777).toBe(0);
    expect(existsSync(join(target, 'deploy', '.env'))).toBe(false);
  });
});

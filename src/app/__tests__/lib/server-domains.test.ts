import { isAdminHost } from '@/app/lib/server-domains';

describe('server domain helpers', () => {
  const originalAdminDomain = process.env.ADMIN_DOMAIN;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.ADMIN_DOMAIN = 'Admin.Example.Test.';
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
    });
  });

  afterAll(() => {
    if (originalAdminDomain === undefined) {
      delete process.env.ADMIN_DOMAIN;
    } else {
      process.env.ADMIN_DOMAIN = originalAdminDomain;
    }

    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalNodeEnv,
      configurable: true,
    });
  });

  it('matches admin hosts case-insensitively and ignores trailing dots', () => {
    expect(isAdminHost('ADMIN.example.test')).toBe(true);
    expect(isAdminHost('admin.example.test.')).toBe(true);
    expect(isAdminHost('admin.example.test:3000')).toBe(true);
    expect(isAdminHost('public.example.test')).toBe(false);
  });

  it('does not treat admin-looking substrings as admin hosts', () => {
    expect(isAdminHost('tt-admin.attacker.example')).toBe(false);
    expect(isAdminHost('public.example.test:3000')).toBe(false);
  });

  it('only accepts numeric ports after a configured admin host', () => {
    expect(isAdminHost('admin.example.test:443.evil.example')).toBe(false);
    expect(isAdminHost('admin.example.test:evil')).toBe(false);
    expect(isAdminHost('admin.example.test:443')).toBe(true);
  });
});

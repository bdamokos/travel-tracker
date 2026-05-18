import { isAdminHost, isEmbedHost } from '@/app/lib/server-domains';

describe('server domain helpers', () => {
  const originalAdminDomain = process.env.ADMIN_DOMAIN;
  const originalEmbedDomain = process.env.EMBED_DOMAIN;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.ADMIN_DOMAIN = 'Admin.Example.Test.';
    process.env.EMBED_DOMAIN = 'https://Maps.Example.Test.';
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

    if (originalEmbedDomain === undefined) {
      delete process.env.EMBED_DOMAIN;
    } else {
      process.env.EMBED_DOMAIN = originalEmbedDomain;
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

  it('matches embed hosts with the same exact-host rules', () => {
    expect(isEmbedHost('maps.example.test')).toBe(true);
    expect(isEmbedHost('maps.example.test:443')).toBe(true);
    expect(isEmbedHost('maps.example.test:3002')).toBe(true);
    expect(isEmbedHost('maps.example.test.evil.example')).toBe(false);
    expect(isEmbedHost('evil-maps.example.test')).toBe(false);
    expect(isEmbedHost('maps.example.test:evil')).toBe(false);
  });
});

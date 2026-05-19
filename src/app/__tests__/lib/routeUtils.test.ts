import {
  getCompositeTransportType,
  getTransportationLabel,
  getTransportIcon,
  normalizeTransportationType
} from '@/app/lib/routeUtils';

describe('routeUtils transport type normalization', () => {
  it('normalizes unsupported transport types to other', () => {
    expect(normalizeTransportationType('sidecar')).toBe('other');
    expect(normalizeTransportationType(null)).toBe('other');
  });

  it('allows callers to provide a supported fallback', () => {
    expect(normalizeTransportationType('sidecar', 'train')).toBe('train');
  });

  it('falls back for labels and icons without throwing', () => {
    expect(getTransportationLabel('sidecar')).toBe('Other');
    expect(getTransportIcon('sidecar')).toBe(getTransportIcon('other'));
  });

  it('ignores invalid segment types when resolving composite transport type', () => {
    expect(getCompositeTransportType([
      { transportType: 'train' },
      { transportType: 'sidecar' }
    ])).toBe('train');
  });

  it('uses the caller fallback when every segment type is invalid', () => {
    expect(getCompositeTransportType([
      { transportType: 'sidecar' },
      { type: { label: 'wagon' } }
    ], 'plane')).toBe('plane');
  });
});

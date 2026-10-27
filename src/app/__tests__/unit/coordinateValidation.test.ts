import { MAX_COORDINATE_LENGTH, parseCoordinate } from '@/app/lib/coordinateValidation';

describe('coordinate validation', () => {
  it.each(['0', '-0', '+47.5', '-.5', '.5', '19.', '00019.25', '-90', '90'])(
    'preserves decimal syntax for %s', (value) => {
      expect(parseCoordinate(value, -90, 90)).toBe(Number(value));
    }
  );

  it.each([null, '', ' 1', '1 ', '1\n', '1e1', '0x10', 'NaN', 'Infinity', '1,5', '１', '19x', '.', '+', '90.1', '-90.1'])(
    'rejects malformed or out-of-range latitude %s', (value) => {
      expect(parseCoordinate(value, -90, 90)).toBeNull();
    }
  );

  it('preserves inclusive longitude bounds', () => {
    expect(parseCoordinate('-180', -180, 180)).toBe(-180);
    expect(parseCoordinate('+180.', -180, 180)).toBe(180);
    expect(parseCoordinate('180.1', -180, 180)).toBeNull();
    expect(parseCoordinate('-180.1', -180, 180)).toBeNull();
  });

  it('accepts the length limit and rejects even numeric input beyond it', () => {
    expect(parseCoordinate('0'.repeat(MAX_COORDINATE_LENGTH), -90, 90)).toBe(0);
    expect(parseCoordinate('0'.repeat(MAX_COORDINATE_LENGTH + 1), -90, 90)).toBeNull();
  });

  it.each(['1'.repeat(4096) + 'x', '.' + '1'.repeat(4096) + 'x', ' '.repeat(4096)])(
    'rejects oversized input before trimming or matching', (value) => {
      const trimSpy = jest.spyOn(String.prototype, 'trim');
      const regexSpy = jest.spyOn(RegExp.prototype, 'test');
      let result: number | null;
      let trimCalls: number;
      let regexCalls: number;
      try {
        result = parseCoordinate(value, -90, 90);
        trimCalls = trimSpy.mock.calls.length;
        regexCalls = regexSpy.mock.calls.length;
      } finally {
        trimSpy.mockRestore();
        regexSpy.mockRestore();
      }
      expect(result).toBeNull();
      expect(trimCalls).toBe(0);
      expect(regexCalls).toBe(0);
    }
  );
});

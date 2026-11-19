import { describe, expect, it } from 'vitest';
import { Fraction, commonDenominator } from '../src/fraction.js';
import { daysBetween, formatDate, isISODate, yearOf } from '../src/dates.js';

describe('Fraction', () => {
  it('reduces and normalizes sign', () => {
    expect(Fraction.of(2, 4).toString()).toBe('1/2');
    expect(Fraction.of(3, -9).toString()).toBe('-1/3');
    expect(Fraction.of(0, 7).toString()).toBe('0');
    expect(Fraction.of(6, 3).toString()).toBe('2');
  });

  it('does exact arithmetic', () => {
    const third = Fraction.of(1, 3);
    expect(third.add(third).add(third).equals(Fraction.ONE)).toBe(true);
    expect(Fraction.of(1, 2).sub(Fraction.of(1, 3)).toString()).toBe('1/6');
    expect(Fraction.of(2, 3).mul(Fraction.of(3, 4)).toString()).toBe('1/2');
    expect(Fraction.of(1, 2).div(Fraction.of(1, 4)).toString()).toBe('2');
    expect(Fraction.ONE.divideBy(7).times(14).toString()).toBe('2');
    expect(Fraction.sum([Fraction.of(1, 6), Fraction.of(1, 3), Fraction.of(1, 2)]).toString()).toBe(
      '1',
    );
  });

  it('keeps precision for deep chains', () => {
    let f = Fraction.ONE;
    for (let i = 2; i < 30; i++) f = f.mul(Fraction.of(1, i));
    expect(f.mul(Fraction.of(1n, 1n)).d > 10n ** 29n).toBe(true);
  });

  it('compares', () => {
    expect(Fraction.of(1, 3).lt(Fraction.of(1, 2))).toBe(true);
    expect(Fraction.of(2, 3).gt(Fraction.of(1, 2))).toBe(true);
    expect(Fraction.of(1, 2).compare(Fraction.of(2, 4))).toBe(0);
    expect(Fraction.max(Fraction.of(1, 4), Fraction.of(1, 3)).toString()).toBe('1/3');
    expect(Fraction.min(Fraction.of(1, 4), Fraction.of(1, 3)).toString()).toBe('1/4');
  });

  it('parses ratios, decimals and percents', () => {
    expect(Fraction.parse(' 3 / 9 ').toString()).toBe('1/3');
    expect(Fraction.parse('0.25').toString()).toBe('1/4');
    expect(Fraction.parse('-1.5').toString()).toBe('-3/2');
    expect(Fraction.parse('50%').toString()).toBe('1/2');
    expect(Fraction.parse('1').toString()).toBe('1');
    expect(() => Fraction.parse('abc')).toThrow(SyntaxError);
    expect(Fraction.tryParse('x/y')).toBeUndefined();
  });

  it('formats', () => {
    expect(Fraction.of(1, 3).toPercent()).toBe('33.33%');
    expect(Fraction.of(1, 8).toNumber()).toBe(0.125);
    expect(JSON.stringify({ s: Fraction.of(2, 6) })).toBe('{"s":"1/3"}');
  });

  it('rejects bad input', () => {
    expect(() => Fraction.of(1, 0)).toThrow(RangeError);
    expect(() => Fraction.of(1.5, 2)).toThrow(RangeError);
    expect(() => Fraction.ONE.div(Fraction.ZERO)).toThrow(RangeError);
  });

  it('finds a common denominator', () => {
    expect(commonDenominator([Fraction.of(1, 4), Fraction.of(1, 6), Fraction.of(2, 9)])).toBe(36n);
  });
});

describe('dates', () => {
  it('validates ISO dates', () => {
    expect(isISODate('2024-02-29')).toBe(true);
    expect(isISODate('2023-02-29')).toBe(false);
    expect(isISODate('1990-13-01')).toBe(false);
    expect(isISODate('1990-1-1')).toBe(false);
    expect(isISODate(undefined)).toBe(false);
  });
  it('computes day differences', () => {
    expect(daysBetween('2000-01-01', '2000-01-06')).toBe(5);
    expect(daysBetween('2000-03-01', '2000-02-28')).toBe(-2);
  });
  it('formats', () => {
    expect(formatDate('1961-03-04')).toBe('March 4, 1961');
    expect(formatDate(undefined)).toBe('an unknown date');
    expect(yearOf('1961-03-04')).toBe(1961);
    expect(yearOf(undefined)).toBeUndefined();
  });
  it('throws on invalid day numbers', () => {
    expect(() => daysBetween('bad', '2000-01-01')).toThrow(RangeError);
  });
});

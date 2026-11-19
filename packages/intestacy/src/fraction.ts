/**
 * Exact rational arithmetic for ownership shares.
 *
 * Heirs' property fractions routinely reach denominators in the thousands
 * (1/3 × 1/7 × 1/2 × 1/9 …). Floating point would silently drift, so every
 * share in the engine is an immutable, always-reduced `Fraction` backed by
 * `bigint`.
 */
export class Fraction {
  /** Numerator (carries the sign). */
  readonly n: bigint;
  /** Denominator (always positive). */
  readonly d: bigint;

  private constructor(n: bigint, d: bigint) {
    this.n = n;
    this.d = d;
  }

  static readonly ZERO = new Fraction(0n, 1n);
  static readonly ONE = new Fraction(1n, 1n);

  /** Create a reduced fraction from integer parts. */
  static of(numerator: bigint | number, denominator: bigint | number = 1n): Fraction {
    let n = toBigInt(numerator, 'numerator');
    let d = toBigInt(denominator, 'denominator');
    if (d === 0n) throw new RangeError('Fraction denominator cannot be zero');
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n < 0n ? -n : n, d);
    return new Fraction(n / g, d / g);
  }

  /**
   * Parse `"3/8"`, `"1"`, `"0.25"` or `"25%"`. Throws on anything else.
   */
  static parse(input: string): Fraction {
    const text = input.trim();
    const ratio = /^(-?\d+)\s*\/\s*(\d+)$/.exec(text);
    if (ratio) return Fraction.of(BigInt(ratio[1]!), BigInt(ratio[2]!));
    const percent = /^(-?\d+(?:\.\d+)?)\s*%$/.exec(text);
    if (percent) return Fraction.fromDecimal(percent[1]!).div(Fraction.of(100));
    if (/^-?\d+(?:\.\d+)?$/.test(text)) return Fraction.fromDecimal(text);
    throw new SyntaxError(`Cannot parse "${input}" as a fraction`);
  }

  /** Like {@link parse} but returns `undefined` instead of throwing. */
  static tryParse(input: string): Fraction | undefined {
    try {
      return Fraction.parse(input);
    } catch {
      return undefined;
    }
  }

  private static fromDecimal(text: string): Fraction {
    const negative = text.startsWith('-');
    const [whole = '0', frac = ''] = text.replace('-', '').split('.');
    const scale = 10n ** BigInt(frac.length);
    const value = BigInt(whole) * scale + BigInt(frac || '0');
    return Fraction.of(negative ? -value : value, scale);
  }

  static sum(values: Iterable<Fraction>): Fraction {
    let total = Fraction.ZERO;
    for (const v of values) total = total.add(v);
    return total;
  }

  add(other: Fraction): Fraction {
    return Fraction.of(this.n * other.d + other.n * this.d, this.d * other.d);
  }

  sub(other: Fraction): Fraction {
    return Fraction.of(this.n * other.d - other.n * this.d, this.d * other.d);
  }

  mul(other: Fraction): Fraction {
    return Fraction.of(this.n * other.n, this.d * other.d);
  }

  div(other: Fraction): Fraction {
    if (other.n === 0n) throw new RangeError('Division by zero');
    return Fraction.of(this.n * other.d, this.d * other.n);
  }

  /** Divide into `parts` equal pieces. */
  divideBy(parts: number | bigint): Fraction {
    return this.div(Fraction.of(parts));
  }

  /** Multiply by a whole number. */
  times(count: number | bigint): Fraction {
    return this.mul(Fraction.of(count));
  }

  compare(other: Fraction): -1 | 0 | 1 {
    const left = this.n * other.d;
    const right = other.n * this.d;
    return left < right ? -1 : left > right ? 1 : 0;
  }

  equals(other: Fraction): boolean {
    return this.n === other.n && this.d === other.d;
  }

  lt(other: Fraction): boolean {
    return this.compare(other) < 0;
  }

  gt(other: Fraction): boolean {
    return this.compare(other) > 0;
  }

  isZero(): boolean {
    return this.n === 0n;
  }

  isPositive(): boolean {
    return this.n > 0n;
  }

  static max(a: Fraction, b: Fraction): Fraction {
    return a.compare(b) >= 0 ? a : b;
  }

  static min(a: Fraction, b: Fraction): Fraction {
    return a.compare(b) <= 0 ? a : b;
  }

  toNumber(): number {
    // Scale down very large terms to keep precision reasonable.
    return Number(this.n) / Number(this.d);
  }

  /** Percentage with the given number of decimals, e.g. `"33.33%"`. */
  toPercent(decimals = 2): string {
    return `${(this.toNumber() * 100).toFixed(decimals)}%`;
  }

  /** Canonical text form: `"1/3"`, `"1"` or `"0"`. */
  toString(): string {
    return this.d === 1n ? this.n.toString() : `${this.n}/${this.d}`;
  }

  toJSON(): string {
    return this.toString();
  }
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a === 0n ? 1n : a;
}

function toBigInt(value: bigint | number, label: string): bigint {
  if (typeof value === 'bigint') return value;
  if (!Number.isInteger(value)) throw new RangeError(`Fraction ${label} must be an integer`);
  return BigInt(value);
}

/** Least common multiple of the denominators, useful for "x/LCD" displays. */
export function commonDenominator(values: readonly Fraction[]): bigint {
  let lcm = 1n;
  for (const v of values) {
    lcm = (lcm * v.d) / gcd(lcm, v.d);
  }
  return lcm;
}

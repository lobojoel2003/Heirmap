import type { StateRules } from '../rules.js';
import type { StateCode } from '../types.js';
import { alabama } from './al.js';
import { georgia } from './ga.js';
import { mississippi } from './ms.js';
import { northCarolina } from './nc.js';
import { southCarolina } from './sc.js';

/** Every state with a rules module, keyed by USPS code. */
export const STATES: Readonly<Record<StateCode, StateRules>> = {
  AL: alabama,
  GA: georgia,
  MS: mississippi,
  NC: northCarolina,
  SC: southCarolina,
};

export const STATE_CODES = Object.keys(STATES).sort() as StateCode[];

export function getStateRules(code: StateCode): StateRules {
  const rules = STATES[code];
  if (!rules) throw new Error(`No intestacy rules module for state "${code}"`);
  return rules;
}

export function isSupportedState(code: string): code is StateCode {
  return Object.prototype.hasOwnProperty.call(STATES, code);
}

export { alabama, georgia, mississippi, northCarolina, southCarolina };

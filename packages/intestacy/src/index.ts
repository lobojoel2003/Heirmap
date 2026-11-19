/**
 * @heirmap/intestacy — an open, citation-backed rules engine for US
 * intestate succession to land ("heirs' property").
 *
 * @packageDocumentation
 */
export { Fraction, commonDenominator } from './fraction.js';
export { computeShares, recipientKey, type ComputeOptions } from './engine.js';
export { EstateContext, nearestGeneration } from './context.js';
export type { LineNode, LineShare, ParentInfo, SpouseInfo, Survival } from './context.js';
export { FamilyIndex } from './family.js';
export { describeRelationship, bloodDistance } from './relationship.js';
export { validateCase } from './validate.js';
export { buildDocumentChecklist } from './checklist.js';
export type { DocumentCategory, DocumentItem } from './checklist.js';
export { selectVersion, versionRef } from './rules.js';
export type { RuleVersion, StateRules, SurvivalRule } from './rules.js';
export { STATES, STATE_CODES, getStateRules, isSupportedState } from './states/index.js';
export * as stateHelpers from './states/common.js';
export { daysBetween, formatDate, isISODate, yearOf } from './dates.js';
export { VERSION } from './version.js';
export type * from './types.js';

import type { VerificationState, WorkOutcome } from '../types';

const copy = {
  quality: 'Completion quality', outcome: 'Work outcome', verification: 'Verification', scope: 'Scope', blockers: 'Blockers', limitations: 'Limitations', evidence: 'Evidence', criteria: 'Acceptance criteria', covered: 'covered', uncovered: 'not covered', command: 'Command', exit: 'Exit', reason: 'Reason',
  outcomeCompleted: 'Completed', outcomePartial: 'Partial', outcomeBlocked: 'Blocked', passed: 'Passed', failed: 'Failed', notRun: 'Not run', notApplicable: 'Not applicable', stale: 'Stale', unknown: 'Unknown',
} as const;

export function qualityCopy() { return copy; }
export function outcomeLabel(value: WorkOutcome) { const labels = qualityCopy(); return value === 'partial' ? labels.outcomePartial : value === 'blocked' ? labels.outcomeBlocked : labels.outcomeCompleted; }
export function verificationLabel(value: VerificationState) { return qualityCopy()[value]; }

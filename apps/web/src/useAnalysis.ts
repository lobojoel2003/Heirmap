import { useMemo } from 'react';
import { analyze, type Analysis } from './model/analysis';
import { useActiveCase, useStore } from './store/store';

/** Analysis of the active case (optionally as of the timeline date). */
export function useAnalysis(): Analysis | undefined {
  const file = useActiveCase();
  const asOf = useStore((s) => s.asOf);
  return useMemo(() => (file ? analyze(file, asOf ?? undefined) : undefined), [file, asOf]);
}

/** Analysis of the active case today, ignoring the timeline. */
export function useCurrentAnalysis(): Analysis | undefined {
  const file = useActiveCase();
  return useMemo(() => (file ? analyze(file) : undefined), [file]);
}

export function computeGrade(summary) {
  const weights = { critical: 5, warning: 3 };
  const weighted = (summary.criticalIssues || 0) * weights.critical + (summary.warnings || 0) * weights.warning;
  const denom = Math.max(1, (summary.pages || 1) * 20);
  const penalty = Math.min(100, Math.round((weighted / (denom + weighted)) * 100));
  const score = Math.max(0, 100 - penalty);
  const letter = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  return { score, letter, weighted, penalty };
}

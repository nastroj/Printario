/**
 * Format a remaining millisecond duration as a compact, readable ETA label.
 */
export function formatPdfEta(remainingMs) {
  if (!Number.isFinite(remainingMs) || remainingMs < 0) return 'Estimating…';
  if (remainingMs < 1000) return '< 1s left';

  const totalSeconds = Math.ceil(remainingMs / 1000);
  if (totalSeconds < 60) return `~${totalSeconds}s left`;

  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return secs > 0 ? `~${mins}m ${secs}s left` : `~${mins}m left`;
}

/**
 * Estimate remaining PDF generation time using completed-unit throughput with
 * light exponential smoothing to avoid jitter across uneven pages.
 */
export function calculatePdfEta({
  current,
  total,
  elapsedMs,
  prevRemainingMs = null,
}) {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(current) || current <= 0) {
    return { remainingMs: null, label: 'Estimating…' };
  }

  const completed = Math.max(0, current - 1);
  if (completed < 2 || !Number.isFinite(elapsedMs) || elapsedMs < 120) {
    return { remainingMs: null, label: 'Estimating…' };
  }

  const msPerUnit = elapsedMs / completed;
  const remainingUnits = Math.max(0, total - completed);
  const rawRemainingMs = remainingUnits * msPerUnit;
  const smoothedMs = Number.isFinite(prevRemainingMs) && prevRemainingMs !== null
    ? prevRemainingMs * 0.65 + rawRemainingMs * 0.35
    : rawRemainingMs;

  return {
    remainingMs: smoothedMs,
    label: formatPdfEta(smoothedMs),
  };
}

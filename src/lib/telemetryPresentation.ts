/** Missing, nonfinite and out-of-range telemetry must never become an alarm or success. */
export function batteryPresentation(value: unknown): { label: string; percent: number | null; low: boolean } {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    return { label: 'No telemetry', percent: null, low: false };
  }
  return { label: `${value}%`, percent: value, low: value < 20 };
}

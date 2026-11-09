/** Normalize payment-return links; settlement is verified by the backend, never by the redirect itself. */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    if (path.includes('payment-return')) return initial ? '/' : null;
    return path;
  } catch {
    return initial ? '/' : null;
  }
}

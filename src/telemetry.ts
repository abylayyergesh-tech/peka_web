/** Only categorical diagnostics; never send error text, stack, URL or identity. */
type Kind = "render" | "runtime" | "unhandled_rejection" | "network" | "server";
let lastSent = 0;
export function reportClientError(kind: Kind, status?: number, requestId?: string) {
  if (Date.now() - lastSent < 10_000) return;
  lastSent = Date.now();
  const api_request_id = requestId && /^[a-f0-9-]{32,36}$/i.test(requestId) ? requestId : undefined;
  void fetch(`${import.meta.env.VITE_API_URL || "/api"}/telemetry/client-errors`, {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit",
    body: JSON.stringify({ app: "peka_web", kind, status, api_request_id }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined);
}
export function installDiagnostics() {
  window.addEventListener("error", () => reportClientError("runtime"));
  window.addEventListener("unhandledrejection", () => reportClientError("unhandled_rejection"));
}

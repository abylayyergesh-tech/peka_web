import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: { queries: {
    retry: (count, error) => count < 1 && ![401, 403, 422].includes(
      (error as { response?: { status?: number } }).response?.status ?? 0),
    refetchOnWindowFocus: false,
  } },
});
let epoch = 0;
let requests = new AbortController();
export const sessionEpoch = () => epoch;
export const sessionSignal = () => requests.signal;
export function resetSession() {
  epoch += 1;
  requests.abort();
  requests = new AbortController();
  void queryClient.cancelQueries();
  queryClient.clear();
  return epoch;
}

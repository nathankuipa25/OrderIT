export type LoadState = "loading" | "empty" | "error" | "ready";
export function getLoadState(input: { loading: boolean; error: boolean; itemCount: number }): LoadState;

export function getLoadState({ loading, error, itemCount }) {
  if (loading) return "loading";
  if (error) return "error";
  if (itemCount === 0) return "empty";
  return "ready";
}

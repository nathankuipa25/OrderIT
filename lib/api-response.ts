type ApiHandler<Args extends unknown[]> = (...args: Args) => Response | Promise<Response>;

export function withPrivateApiHeaders<Args extends unknown[]>(handler: ApiHandler<Args>) {
  return async (...args: Args): Promise<Response> => {
    const response = await handler(...args);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");

    const vary = (response.headers.get("Vary") || "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    if (!vary.includes("*")) {
      const seen = new Set(vary.map((name) => name.toLowerCase()));
      for (const name of ["Authorization", "Cookie"]) {
        if (!seen.has(name.toLowerCase())) {
          vary.push(name);
          seen.add(name.toLowerCase());
        }
      }
      response.headers.set("Vary", vary.join(", "));
    }
    return response;
  };
}

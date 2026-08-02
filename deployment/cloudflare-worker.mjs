const REPOSITORY_PREFIX = "/GameYard";

function repositoryLocation(assetUrl, location) {
  const redirectUrl = new URL(location, assetUrl);
  if (redirectUrl.origin !== assetUrl.origin || !redirectUrl.pathname.startsWith("/")) {
    throw new Error("The static asset binding returned an invalid redirect target");
  }
  redirectUrl.pathname = `${REPOSITORY_PREFIX}${redirectUrl.pathname}`;
  return redirectUrl.href;
}

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === REPOSITORY_PREFIX) {
      requestUrl.pathname = `${REPOSITORY_PREFIX}/`;
      return Response.redirect(requestUrl, 308);
    }
    if (!requestUrl.pathname.startsWith(`${REPOSITORY_PREFIX}/`)) {
      return new Response("Not Found", { status: 404 });
    }
    if (typeof env?.ASSETS?.fetch !== "function") {
      throw new Error("The required ASSETS binding is unavailable");
    }

    const assetUrl = new URL(request.url);
    assetUrl.pathname = requestUrl.pathname.slice(REPOSITORY_PREFIX.length);
    const response = await env.ASSETS.fetch(new Request(assetUrl, request));
    const location = response.headers.get("location");
    if (location === null) return response;

    const headers = new Headers(response.headers);
    headers.set("location", repositoryLocation(assetUrl, location));
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

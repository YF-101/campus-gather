// Next's internal Request URL can use localhost even when the browser used 127.0.0.1.
// Host is the destination received by this loopback-only server, not X-Forwarded-Host.
export function sameOrigin(request: Request) {
    const origin = request.headers.get('origin');
    if (!origin)
        return true;
    try {
        const incoming = new URL(origin), internal = new URL(request.url);
        return incoming.host === request.headers.get('host') && incoming.protocol === internal.protocol;
    }
    catch {
        return false;
    }
}

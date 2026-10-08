// worker.js — proxy ik.imagekit.io/maarifdh via ik.maarifdh.sch.id
// Biar lolos blokir Kominfo: user -> ik.maarifdh.sch.id (IP Cloudflare) -> ik.imagekit.io

const UPSTREAM_ORIGIN = "https://ik.imagekit.io";
const UPSTREAM_BASE = "/maarifdh"; // prefix path di ImageKit

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }

    // health check
    if (url.pathname === "/" || url.pathname === "/favicon.ico") {
      return new Response("ik.maarifdh.sch.id — ImageKit proxy OK\n→ " + UPSTREAM_ORIGIN + UPSTREAM_BASE + "/{path}?tr=...", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // optional: block path traversal / double prefix abuse
    // cegah jadi open proxy liar — hanya boleh proxy ke /maarifdh/*
    // semua path di ik.maarifdh.sch.id otomatis dipetakan ke /maarifdh{path}
    const targetUrl = `${UPSTREAM_ORIGIN}${UPSTREAM_BASE}${url.pathname}${url.search}`;

    const cache = caches.default;
    // cache key pakai targetUrl (bukan url proxy) biar konsisten
    const cacheKey = new Request(targetUrl, request);

    let response = await cache.match(cacheKey);
    if (response) {
      // tambahin header biar keliatan hit
      const hitResp = new Response(response.body, response);
      hitResp.headers.set("X-Cache", "HIT");
      hitResp.headers.set("Access-Control-Allow-Origin", "*");
      return hitResp;
    }

    // fetch ke upstream (lewat jaringan Cloudflare, bukan ISP user yang diblokir)
    const upstreamHeaders = new Headers();
    // terusin header yang relevan aja
    const passHeaders = ["accept", "accept-language", "accept-encoding", "range", "if-none-match", "if-modified-since"];
    for (const h of passHeaders) {
      const v = request.headers.get(h);
      if (v) upstreamHeaders.set(h, v);
    }
    // set UA biar gak dianggap bot aneh
    upstreamHeaders.set("User-Agent", request.headers.get("User-Agent") || "Cloudflare-Worker-ik-proxy");
    // host header akan diisi otomatis ke ik.imagekit.io

    let upstreamResp;
    try {
      upstreamResp = await fetch(targetUrl, {
        method: request.method,
        headers: upstreamHeaders,
        cf: {
          cacheEverything: true,
          cacheTtl: 86400,
        },
      });
    } catch (e) {
      return new Response("Upstream fetch failed: " + (e?.message || e), {
        status: 502,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // kalau upstream 304/404/etc tetap terusin, tapi hanya cache kalau 200/206
    const respHeaders = new Headers(upstreamResp.headers);
    // bersih-bersih header yang gak perlu / bahaya
    respHeaders.delete("content-security-policy");
    respHeaders.delete("clear-site-data");
    respHeaders.delete("set-cookie");
    respHeaders.delete("content-security-policy-report-only");
    respHeaders.delete("cross-origin-opener-policy");
    respHeaders.delete("cross-origin-resource-policy");

    // set header proxy & CORS & cache
    respHeaders.set("Access-Control-Allow-Origin", "*");
    respHeaders.set("X-Proxied-By", "ik.maarifdh.sch.id");
    respHeaders.set("X-Upstream", UPSTREAM_ORIGIN + UPSTREAM_BASE);
    respHeaders.set("Vary", "Accept, Accept-Encoding");

    // kalau upstream gak ngasih cache header, kasih default 1 hari (image/video statis)
    if (!respHeaders.has("Cache-Control")) {
      respHeaders.set("Cache-Control", "public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400");
    }
    // Cloudflare edge cache hint
    respHeaders.set("Cache-Tag", "imagekit-proxy");

    const finalResp = new Response(upstreamResp.body, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: respHeaders,
    });

    // hanya cache response sukses (200 OK atau 206 Partial Content untuk video Range)
    if (upstreamResp.ok || upstreamResp.status === 206) {
      ctx.waitUntil(cache.put(cacheKey, finalResp.clone()));
    }

    // tandain MISS
    finalResp.headers.set("X-Cache", "MISS");
    return finalResp;
  },
};

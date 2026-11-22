/**
 * Isolated Cloudflare Workers migration probe for Tawseela.
 *
 * This is NOT the production API and must never be configured in the mobile app.
 * It exists only to verify account deployment, Worker routing, and health checks.
 * Real API routes remain disabled until Firebase Auth/Firestore and service adapters pass tests.
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "tawseela-cloudflare-migration-probe",
        productionApi: false,
        stage: "runtime-smoke-test",
      }, {
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }

    return Response.json({
      error: {
        code: "migration_not_complete",
        message: "This is an isolated migration probe, not the Tawseela production API.",
      },
    }, {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  },
};

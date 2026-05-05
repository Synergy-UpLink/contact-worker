import { sendEmail } from "./email";

// ---------------------------------------------------------------------------
// CORS — origin whitelist
//
// Set ALLOWED_ORIGINS as a comma-separated list in your env config:
//
//   .dev.vars (local):
//     ALLOWED_ORIGINS=http://localhost:4000,http://127.0.0.1:4000
//
//   wrangler.toml [vars] or secret (production):
//     ALLOWED_ORIGINS=https://synergyuplink.com,https://clienta.com,https://clientb.org
//
// The worker reflects the requesting origin back only if it's on the list,
// which is correct multi-origin CORS behavior. An unrecognised origin gets
// a 403 before anything else runs.
// ---------------------------------------------------------------------------
function getAllowedOrigins(env: Env): Set<string> {
	const raw = env.ALLOWED_HOSTS ?? "";
	return new Set(
		raw.split(",").map((o: string) => o.trim()).filter(Boolean)
	);
}

function corsHeaders(origin: string): Record<string, string> {
	return {
		"Access-Control-Allow-Origin":  origin,
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		"Vary": "Origin",
	};
}

// ---------------------------------------------------------------------------
// Site config — add an entry per client as you onboard them.
// The worker delivers to the right inbox and nothing else; all email
// formatting is the responsibility of the submitting site.
// ---------------------------------------------------------------------------
interface SiteConfig {
	email: string;  // recipient address
	name?: string;  // human label — unused at runtime, just for readability
}

const SITES: Record<string, SiteConfig> = {
	"sul-main": {
		name:  "Synergy UpLink",
		email: "contact@synergyuplink.com",
	},
	"flomads-main": {
		name:  "Flomads",
		email: "newsletter@flomads.com",
	}
	// "client-slug": { name: "Client Name", email: "hello@client.com" },
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default {
	async fetch(request: Request, env: Env) {
		const origin  = request.headers.get("Origin") ?? "";
		console.log("Origin:", origin);
		const allowed = getAllowedOrigins(env);

		const cors = corsHeaders(origin);

		// Reject unknown origins before doing anything else, but include CORS headers in the response for clarity.
		if (!allowed.has(origin)) {
			return new Response("Forbidden", { status: 403, headers: cors });
		}


		// Preflight
		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: cors });
		}

		if (request.method !== "POST") {
			return new Response("Method Not Allowed", { status: 405, headers: cors });
		}

		// Rate limiting — 3 submissions per IP per minute
		const ip    = request.headers.get("CF-Connecting-IP") ?? "unknown";
		const key   = `rate:${ip}`;
		const count = await env.KV.get(key);

		if (count && parseInt(count) >= 3) {
			return new Response("Too many requests", { status: 429, headers: cors });
		}

		await env.KV.put(key, (parseInt(count ?? "0") + 1).toString(), {
			expirationTtl: 60,
		});

		// Parse body
		const contentType = request.headers.get("content-type") ?? "";
		if (!contentType.includes("application/json")) {
			return new Response("Expected JSON", { status: 400, headers: cors });
		}

		let body: Record<string, string>;
		try {
			body = await request.json();
		} catch {
			return new Response("Invalid JSON", { status: 400, headers: cors });
		}

		// Honeypot
		if (body.company) {
			return new Response("Spam detected", { status: 400, headers: cors });
		}

		// Required: siteId, email, subject, and either html or text
		const { siteId, email, subject, html, text } = body;
		if (!siteId || !email || !subject || (!html && !text)) {
			return new Response(
				"Invalid input — required: siteId, email, subject, and html or text",
				{ status: 400, headers: cors }
			);
		}

		// Site lookup
		const site = SITES[siteId];
		if (!site) {
			return new Response("Unknown siteId", { status: 400, headers: cors });
		}

		// Pass html or text through directly — worker doesn't touch the body
		await sendEmail({
			apiKey: env.RESEND_API_KEY,
			to:      site.email,
			from:    email,
			subject,
			...(html ? { html } : { text }),
		});

		return new Response("OK", { status: 200, headers: cors });
	},
};
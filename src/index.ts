import { sendEmail } from "./email";

const ALLOWED_ORIGIN = "*"; // change if your domain differs

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": ALLOWED_ORIGIN,
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

export default {
	async fetch(request, env) {
		// Handle CORS preflight
		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: CORS_HEADERS });
		}

		if (request.method !== "POST") {
			return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
		}

		const ip = request.headers.get("CF-Connecting-IP");

		// Basic rate limiting (per IP)
		const key = `rate:${ip}`;
		const count = await env.KV.get(key);

		if (count && parseInt(count) > 3) {
			return new Response("Too many requests", { status: 429, headers: CORS_HEADERS });
		}

		await env.KV.put(key, (parseInt(count || "0") + 1).toString(), {
			expirationTtl: 60 // 1 minute window
		});

		// Ensure content-type is application/json
		const contentType = request.headers.get("content-type");

		if (!contentType?.includes("application/json")) {
			return new Response("Expected JSON", { status: 400, headers: CORS_HEADERS });
		}

		let body;

		try {
			body = await request.json();
		} catch {
			return new Response("Invalid JSON", { status: 400, headers: CORS_HEADERS });
		}

		// Honeypot spam check
		if (body.company) {
			return new Response("Spam detected", { status: 400, headers: CORS_HEADERS });
		}

		// Basic validation
		if (!body.email || !body.message || !body.siteId) {
			return new Response("Invalid input", { status: 400, headers: CORS_HEADERS });
		}

		// Lookup config (hardcoded for now)
		const config = {
			"sul-main": {
				email: "contact@synergyuplink.com",
				subjectPrefix: "Contact Form Submission: "
			}
		};

		const site = config[body.siteId];
		if (!site) {
			return new Response("Unknown site", { status: 400, headers: CORS_HEADERS });
		}

		// Send email
		await sendEmail({
			apiKey: env.RESEND_API_KEY,
			to: site.email,
			from: body.email,
			subject: `New message from ${body.name}`,
			text: body.message,
		});

		return new Response("OK", { status: 200, headers: CORS_HEADERS });
	}
};
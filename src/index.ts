import { sendEmail } from "./email";
export default {
	async fetch(request, env) {
		if (request.method !== "POST") {
			return new Response("Method Not Allowed", { status: 405 });
		}

		const ip = request.headers.get("CF-Connecting-IP");

		// Basic rate limiting (per IP)
		const key = `rate:${ip}`;
		const count = await env.KV.get(key);

		if (count && parseInt(count) > 3) {
		  return new Response("Too many requests", { status: 429 });
		}

		await env.KV.put(key, (parseInt(count || "0") + 1).toString(), {
		  expirationTtl: 60 // 1 minute window
		});

		// Ensure content-type is application/json
		const contentType =
			request.headers.get("content-type");

		if (!contentType?.includes("application/json")) {
			return new Response(
				"Expected JSON",
				{ status: 400 }
			);
		}

		let body;

		try {
			body = await request.json();
		} catch {
			return new Response(
				"Invalid JSON",
				{ status: 400 }
			);
		}

		// Honeypot spam check
		if (body.company) {
			return new Response("Spam detected", { status: 400 });
		}

		// Basic validation
		if (!body.email || !body.message || !body.siteId) {
			return new Response("Invalid input", { status: 400 });
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
			return new Response("Unknown site", { status: 400 });
		}

		// Send email (pseudo — replace with real API call)
		await sendEmail({
		
			apiKey: env.RESEND_API_KEY,
			to: site.email,
			from: body.email,
			subject: `New message from ${body.name}`,
			text: body.message,
		});

		return new Response("OK", { status: 200 });
	}
};
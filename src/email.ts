import { Resend } from "resend";

type SendEmailParams = {
	apiKey:   string;
	to:       string;
	from:     string;  // used as replyTo — the submitter's address
	subject:  string;
} & (
	| { html: string; text?: never }
	| { text: string; html?: never }
);

export async function sendEmail(params: SendEmailParams): Promise<void> {
	const { apiKey, to, from, subject } = params;
	const resend = new Resend(apiKey);

	const { error } = await resend.emails.send({
		from:    "contact@synergyuplink.com",  // verified sender
		replyTo: from,                          // submitter's address — hit reply and it goes to them
		to:      [to],
		subject,
		...(params.html ? { html: params.html } : { text: params.text }),
	});

	if (error) {
		console.error("Email send failed:", error);
		throw new Error(`Resend API error: ${error.message}`);
	}
}
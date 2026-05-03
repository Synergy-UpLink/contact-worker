// src/email.ts
import { Resend } from 'resend';
interface SendEmailParams {
    apiKey: string;
    to: string;
    from: string;
    subject: string;
    text: string;
}

export async function sendEmail({
    apiKey,
    to,
    from,
    subject,
    text,
}: SendEmailParams): Promise<void> {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
        from: from,
        to: [to],
        subject: subject,
        html: 'text',
    });

    if (error) {
        console.error(
            "Email send failed:",
            error
        );

        throw new Error(
            `Resend API error: ${error.message}`
        );
    }
}
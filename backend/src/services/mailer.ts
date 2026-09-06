import nodemailer from "nodemailer";
import { env } from "../config/env";

// Single shared Ethereal transport is fine for the assignment: Ethereal is
// a fake SMTP catch-all, and "multiple senders" is represented by the
// From: header differing per sender, not by separate SMTP accounts. If you
// want fully separate inboxes per sender, create one Ethereal test account
// per sender (see scripts/create-ethereal-account.js) and swap the
// transport lookup below to be keyed by senderId.
const transport = nodemailer.createTransport({
  host: env.ethereal.host,
  port: env.ethereal.port,
  secure: false,
  auth: {
    user: env.ethereal.user,
    pass: env.ethereal.pass,
  },
});

export interface SendResult {
  messageId: string;
  previewUrl: string | false;
}

export async function sendEmail(params: {
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  html: string;
}): Promise<SendResult> {
  const info = await transport.sendMail({
    from: `"${params.fromName}" <${params.fromEmail}>`,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });

  return {
    messageId: info.messageId,
    previewUrl: nodemailer.getTestMessageUrl(info),
  };
}

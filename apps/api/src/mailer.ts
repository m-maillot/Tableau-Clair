import nodemailer from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string | undefined;
  password?: string | undefined;
  from: string;
}

/** Envoi par SMTP : Mailpit en développement, relais SMTP Brevo en production. */
export function createSmtpMailer(config: SmtpConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // 465 : TLS implicite ; 587 / 1025 : STARTTLS opportuniste.
    secure: config.port === 465,
    ...(config.user ? { auth: { user: config.user, pass: config.password ?? '' } } : {}),
  });

  return {
    async send(mail) {
      await transport.sendMail({ from: config.from, ...mail });
    },
  };
}

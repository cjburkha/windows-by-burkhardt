const { SESClient, SendEmailCommand, SendRawEmailCommand } = require('@aws-sdk/client-ses');

/**
 * Send consultation request email via AWS SES
 */
async function sendConsultationRequest(formData, tenant) {
  // Create the SES client here (not at module load) so it always
  // reads the current env vars — avoids stale/undefined credentials
  // when the module is first loaded before dotenv has run.
  const sesClient = new SESClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.AWS_SES_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SES_SECRET_ACCESS_KEY
    }
  });
  const {
    name,
    email,
    phone,
    address,
    city,
    state,
    zip,
    preferredDate,
    preferredTime,
    preferredContact,
    message,
    referralFirstName,
    referralLastName,
    referralPhone
  } = formData;

  const emailBody = `
New In-Home Consultation Request

Contact Information:
-------------------
Name: ${name}
Email: ${email}
Phone: ${phone}

Address:
--------
${address || 'Not provided'}
${city ? `${city}, ` : ''}${state || ''} ${zip || ''}

Scheduling Preferences:
----------------------
Preferred Date: ${preferredDate || 'Not specified'}
Preferred Time: ${preferredTime || 'Not specified'}
Preferred Contact: ${preferredContact || 'Not specified'}

Additional Message:
------------------
${message || 'No additional message'}

${(referralFirstName || referralLastName || referralPhone) ? `Referred By:
------------
Name: ${[referralFirstName, referralLastName].filter(Boolean).join(' ')}
Phone: ${referralPhone || 'Not provided'}
` : ''}
---
This consultation request was submitted via ${tenant.brandName} website.
Co-branded with Apex Energy Group.
  `;

  // Skip real SES send in two cases:
  //  1. NODE_ENV=test  — CI running the fake server
  //  2. SKIP_EMAIL=true — real dev server started via `npm run test:dev`
  if (process.env.NODE_ENV === 'test' || process.env.SKIP_EMAIL === 'true') {
    return { success: true, messageId: 'test-mock-id', emailBody };
  }

  const params = {
    Source: `${tenant.brandName} <${tenant.fromEmail}>`,
    Destination: {
      ToAddresses: [tenant.recipientEmail],
      ...(tenant.ccEmail ? { CcAddresses: [tenant.ccEmail] } : {})
    },
    ReplyToAddresses: [email], // safe — only used as reply-to, not injected into headers
    Message: {
      Subject: {
        Data: `New Consultation Request from ${name}`,
        Charset: 'UTF-8'
      },
      Body: {
        Text: {
          Data: emailBody,
          Charset: 'UTF-8'
        },
        Html: {
          Data: `
            <html>
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #2c5282;">New In-Home Consultation Request</h2>
                
                <h3 style="color: #2c5282; border-bottom: 2px solid #2c5282; padding-bottom: 5px;">Contact Information</h3>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
                <p><strong>Phone:</strong> <a href="tel:${phone}">${phone}</a></p>
                
                <h3 style="color: #2c5282; border-bottom: 2px solid #2c5282; padding-bottom: 5px;">Address</h3>
                <p>${address || 'Not provided'}<br/>
                ${city ? `${city}, ` : ''}${state || ''} ${zip || ''}</p>
                
                <h3 style="color: #2c5282; border-bottom: 2px solid #2c5282; padding-bottom: 5px;">Scheduling Preferences</h3>
                <p><strong>Preferred Date:</strong> ${preferredDate || 'Not specified'}</p>
                <p><strong>Preferred Time:</strong> ${preferredTime || 'Not specified'}</p>
                <p><strong>Preferred Contact:</strong> ${preferredContact || 'Not specified'}</p>
                
                ${message ? `
                  <h3 style="color: #2c5282; border-bottom: 2px solid #2c5282; padding-bottom: 5px;">Additional Message</h3>
                  <p>${message}</p>
                ` : ''}

                ${(referralFirstName || referralLastName || referralPhone) ? `
                  <h3 style="color: #2c5282; border-bottom: 2px solid #2c5282; padding-bottom: 5px;">Referred By</h3>
                  <p><strong>Name:</strong> ${[referralFirstName, referralLastName].filter(Boolean).join(' ')}</p>
                  <p><strong>Phone:</strong> ${referralPhone || 'Not provided'}</p>
                ` : ''}
                
                <hr style="margin-top: 30px; border: none; border-top: 1px solid #ddd;"/>
                <p style="font-size: 12px; color: #666;">
                  This consultation request was submitted via ${tenant.brandName} website.<br/>
                  Co-branded with Apex Energy Group.
                </p>
              </body>
            </html>
          `,
          Charset: 'UTF-8'
        }
      }
    }
  };

  try {
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    console.log('Email sent successfully:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a confirmation email to the customer after they submit the form.
 * Fire-and-forget — a failure here never blocks the submission response.
 */
async function sendConfirmation(formData, tenant) {
  if (process.env.NODE_ENV === 'test' || process.env.SKIP_EMAIL === 'true') {
    return { success: true, messageId: 'test-mock-confirmation-id' };
  }

  const sesClient = new SESClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.AWS_SES_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SES_SECRET_ACCESS_KEY
    }
  });

  const { name, email, preferredDate, preferredTime } = formData;
  const firstName = name.split(' ')[0];

  const scheduleNote = preferredDate
    ? `You mentioned ${preferredDate}${preferredTime ? ` in the ${preferredTime.toLowerCase()}` : ''} as your preference — we'll do our best to accommodate that.`
    : `We'll reach out shortly to find a time that works for you.`;

  const textBody = `Hi ${firstName},

Thank you for reaching out to ${tenant.brandName}! We received your consultation request and will be in touch soon.

${scheduleNote}

If you have any questions in the meantime, just reply to this email.

— The ${tenant.brandName} Team
Co-branded with Apex Energy Group
`;

  const htmlBody = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2c5282;">We got your request, ${firstName}!</h2>
        <p>Thank you for reaching out to <strong>${tenant.brandName}</strong>. We received your consultation request and will be in touch soon.</p>
        <p>${scheduleNote}</p>
        <p>If you have any questions in the meantime, just reply to this email.</p>
        <br/>
        <p style="margin: 0;">— The ${tenant.brandName} Team</p>
        <p style="margin: 0; font-size: 12px; color: #666;">Co-branded with Apex Energy Group</p>
      </body>
    </html>
  `;

  try {
    const command = new SendEmailCommand({
      Source: `${tenant.brandName} <${tenant.fromEmail}>`,
      Destination: { ToAddresses: [email] },
      ReplyToAddresses: [tenant.recipientEmail],
      Message: {
        Subject: { Data: `We received your request — ${tenant.brandName}`, Charset: 'UTF-8' },
        Body: {
          Text: { Data: textBody, Charset: 'UTF-8' },
          Html: { Data: htmlBody, Charset: 'UTF-8' }
        }
      }
    });
    const response = await sesClient.send(command);
    console.log('Confirmation email sent:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    console.error('Confirmation email failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send the SMS-consent record to the tenant's recipient inbox as a raw MIME
 * email with the signature PNG attached. Provides an auditable trail of
 * express written consent for TCR / CTIA compliance review.
 */
async function sendSmsConsentRecord(data, tenant) {
  const {
    name, phone, address, email,
    consentText, consentTimestamp,
    signature, ip, userAgent, pageUrl,
  } = data;

  const safe = (s) => String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const textBody = `SMS CONSENT RECORD — ${tenant.brandName}

Customer:    ${name}
Phone:       ${phone}
Address:     ${address || '(not provided)'}
Email:       ${email || '(not provided)'}

Captured:    ${consentTimestamp}
IP:          ${ip || '(unknown)'}
User Agent:  ${userAgent || '(unknown)'}
Page:        ${pageUrl || '(unknown)'}

Disclosure shown to customer:
-----------------------------
${consentText}

Signature attached: signature.png
This record serves as proof of express written consent under TCPA / CTIA Messaging Principles.`;

  const htmlBody = `<html><body style="font-family: Arial, sans-serif; line-height: 1.55; color: #222; max-width: 680px;">
<h2 style="color: #1a1a1a; border-bottom: 2px solid #1a1a1a; padding-bottom: 6px;">SMS Consent Record</h2>
<p style="font-size: 12px; color: #666; margin-top: -8px;">${safe(tenant.brandName)} &mdash; proof of express written consent</p>

<h3 style="color: #1a1a1a; margin-top: 24px;">Customer</h3>
<table cellpadding="4" style="border-collapse: collapse;">
  <tr><td><strong>Name</strong></td><td>${safe(name)}</td></tr>
  <tr><td><strong>Phone</strong></td><td>${safe(phone)}</td></tr>
  <tr><td><strong>Address</strong></td><td>${safe(address) || '<em>not provided</em>'}</td></tr>
  <tr><td><strong>Email</strong></td><td>${safe(email) || '<em>not provided</em>'}</td></tr>
</table>

<h3 style="color: #1a1a1a; margin-top: 24px;">Consent metadata</h3>
<table cellpadding="4" style="border-collapse: collapse; font-size: 13px;">
  <tr><td><strong>Captured</strong></td><td>${safe(consentTimestamp)}</td></tr>
  <tr><td><strong>IP address</strong></td><td>${safe(ip) || '<em>unknown</em>'}</td></tr>
  <tr><td><strong>User agent</strong></td><td>${safe(userAgent) || '<em>unknown</em>'}</td></tr>
  <tr><td><strong>Page URL</strong></td><td>${safe(pageUrl) || '<em>unknown</em>'}</td></tr>
</table>

<h3 style="color: #1a1a1a; margin-top: 24px;">Disclosure shown to customer</h3>
<div style="border: 1px solid #ccc; padding: 12px 14px; background: #fafafa; white-space: pre-wrap;">${safe(consentText)}</div>

<h3 style="color: #1a1a1a; margin-top: 24px;">Signature</h3>
<p style="font-size: 12px; color: #666;">See attachment <code>signature.png</code>. Inline preview:</p>
<img src="cid:signature.png" alt="customer signature" style="border: 1px solid #ddd; background: #fff; max-width: 480px;" />

<hr style="margin-top: 30px; border: none; border-top: 1px solid #ddd;" />
<p style="font-size: 11px; color: #666;">Retain this record as proof of express written consent under TCPA / CTIA Messaging Principles. Submitted via ${safe(tenant.brandName)} website.</p>
</body></html>`;

  if (process.env.NODE_ENV === 'test' || process.env.SKIP_EMAIL === 'true') {
    return { success: true, messageId: 'test-mock-consent-id', emailBody: textBody };
  }

  const sesClient = new SESClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.AWS_SES_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SES_SECRET_ACCESS_KEY,
    },
  });

  const sigBase64 = (signature || '').replace(/^data:image\/png;base64,/, '');
  const boundary = `=_apex_consent_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const altBoundary = `=_apex_consent_alt_${Math.random().toString(36).slice(2)}`;
  const fromHeader = `${tenant.brandName} <${tenant.fromEmail}>`;
  const toHeader = tenant.ccEmail ? `${tenant.recipientEmail}` : tenant.recipientEmail;
  const subject = `SMS Consent — ${name} (${phone})`;

  const headers = [
    `From: ${fromHeader}`,
    `To: ${toHeader}`,
    ...(tenant.ccEmail ? [`Cc: ${tenant.ccEmail}`] : []),
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; boundary="${boundary}"`,
  ].join('\r\n');

  const rawBody = [
    headers,
    '',
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    `--${altBoundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    textBody,
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlBody,
    '',
    `--${altBoundary}--`,
    '',
    `--${boundary}`,
    'Content-Type: image/png; name="signature.png"',
    'Content-Transfer-Encoding: base64',
    'Content-ID: <signature.png>',
    'Content-Disposition: attachment; filename="signature.png"',
    '',
    sigBase64.replace(/(.{76})/g, '$1\r\n'),
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  try {
    const command = new SendRawEmailCommand({
      Source: tenant.fromEmail,
      Destinations: [tenant.recipientEmail, ...(tenant.ccEmail ? [tenant.ccEmail] : [])],
      RawMessage: { Data: Buffer.from(rawBody, 'utf-8') },
    });
    const response = await sesClient.send(command);
    console.log('SMS consent email sent:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    console.error('Error sending SMS consent email:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendConsultationRequest,
  sendConfirmation,
  sendSmsConsentRecord,
};

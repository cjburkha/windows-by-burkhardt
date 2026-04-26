const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

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

module.exports = {
  sendConsultationRequest,
  sendConfirmation
};

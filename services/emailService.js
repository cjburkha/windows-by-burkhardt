const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

/**
 * Send consultation request email via AWS SES
 */
async function sendConsultationRequest(formData) {
  // Skip real email send in test environment
  if (process.env.NODE_ENV === 'test') {
    console.log('[test] email skipped for:', formData.email);
    return { success: true, messageId: 'test-mock-id' };
  }

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
This consultation request was submitted via Windows by Burkhardt website.
Co-branded with Apex Energy Group.
  `;

  const params = {
    Source: process.env.AWS_SES_FROM_EMAIL,
    Destination: {
      ToAddresses: [process.env.RECIPIENT_EMAIL || 'chris.burkhardt@live.com']
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
                  This consultation request was submitted via Windows by Burkhardt website.<br/>
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

module.exports = {
  sendConsultationRequest
};

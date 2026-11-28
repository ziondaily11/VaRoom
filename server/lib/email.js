const SECURITY_EMAIL_FROM = 'VaRoom <otp@varoom.co.ke>';

async function sendEmail({ from, to, subject, html, headers, idempotencyKey }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');

  const requestHeaders = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
  if (idempotencyKey) requestHeaders['Idempotency-Key'] = idempotencyKey;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify({
      from: from || process.env.RESEND_FROM_EMAIL || 'VaRoom <onboarding@resend.dev>',
      to,
      subject,
      html,
      ...(headers && Object.keys(headers).length > 0 ? { headers } : {})
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Email provider rejected request: ${body}`);
  }

  const body = await response.json();
  if (!body.id) throw new Error('Email provider returned no message ID');
  return { id: body.id };
}

/** A received email's full content (Resend Receiving API): headers, text, html, authentication results. */
async function fetchReceivedEmail(id) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`Email provider could not return the received email (${response.status})`);
  return response.json();
}

module.exports = { sendEmail, fetchReceivedEmail, SECURITY_EMAIL_FROM };

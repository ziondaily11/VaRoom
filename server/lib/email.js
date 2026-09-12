async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || 'VaRoom <onboarding@resend.dev>',
      to,
      subject,
      html
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Email provider rejected request: ${body}`);
  }
}

module.exports = { sendEmail };

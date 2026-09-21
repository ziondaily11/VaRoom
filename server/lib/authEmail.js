const { sendEmail } = require('./email');

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function emailShell(title, content) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:28px 24px;color:#1a1210;background:#fff;border:1px solid #d9c9c2;border-radius:8px"><h2 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h2>${content}<p style="font-size:12px;color:#9e8e89;line-height:1.5;border-top:1px solid #eae1dc;padding-top:14px">If you did not request this, you can safely ignore this email.</p></div>`;
}

async function sendRecoveryOtp(email, otp) {
  if (!otp) throw new Error('Supabase did not generate a recovery code');
  return sendEmail({ to: email, subject: 'Reset your VaRoom password', html: emailShell('Reset your VaRoom password', `<p style="font-size:14px;color:#756661;line-height:1.5">We received a request to reset your VaRoom password. Your verification code is:</p><p style="font-family:Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:6px;text-align:center;color:#c41e3a">${escapeHtml(otp)}</p><p style="font-size:13px;color:#756661">This code expires in one hour.</p>`) });
}

async function sendConfirmationEmail(email, actionLink) {
  if (!actionLink) throw new Error('Supabase did not generate a confirmation link');
  return sendEmail({ to: email, subject: 'Confirm your VaRoom account', html: emailShell('Confirm your VaRoom account', `<p style="font-size:14px;color:#756661;line-height:1.5">Thanks for joining VaRoom. Confirm your email address to finish setting up your account.</p><p style="margin:24px 0"><a href="${escapeHtml(actionLink)}" style="display:inline-block;background:#c41e3a;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600">Confirm email address</a></p><p style="font-size:12px;color:#756661;word-break:break-all">If the button does not work, copy this link into your browser:<br>${escapeHtml(actionLink)}</p>`) });
}

module.exports = { sendRecoveryOtp, sendConfirmationEmail };

require('dotenv').config();
const supabaseAdmin = require('../lib/supabaseClient');
const { hashPassword } = require('../routes/adminRoutes');

async function main() {
  const [name, email, password] = process.argv.slice(2);
  if (!name || !email || !password) throw new Error('Usage: node scripts/seed-admin.js "Name" email password');
  const passwordHash = await hashPassword(password);
  const { error } = await supabaseAdmin.from('admins').insert({
    name,
    email: email.trim().toLowerCase(),
    password_hash: passwordHash,
    role: 'super_admin',
    password_set_at: new Date().toISOString()
  });
  if (error) throw error;
  console.log(`Seeded admin ${email}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

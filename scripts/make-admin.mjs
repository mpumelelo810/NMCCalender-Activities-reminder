// Usage: ADMIN_PASSWORD='<hidden-input>' node scripts/make-admin.mjs +268XXXXXXXX name [administrator|organiser]
// Prints an INSERT with a PBKDF2 password hash only; it never prints the supplied password.
import { hashPassword } from '../src/lib.js';

const [phoneArg, nameArg, roleArg = 'administrator'] = process.argv.slice(2);
const phone = String(phoneArg || '').trim().replace(/[\\s()-]/g, '');
const name = String(nameArg || '').trim().slice(0, 80);
const role = String(roleArg || 'administrator').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!/^\\+268[0-9]{8}$/.test(phone) || !name || !['administrator', 'organiser'].includes(role) || !password || password.length < 12) {
  console.error('Usage: ADMIN_PASSWORD=<12+ characters> node scripts/make-admin.mjs +268XXXXXXXX name [administrator|organiser]');
  process.exit(1);
}

const esc = value => String(value).replace(/'/g, "''");
const email = phone.replace(/[^0-9]/g, '') + '@nmcc.local';
const passwordHash = await hashPassword(password);
const createdAt = new Date().toISOString();

console.log(
  "INSERT INTO admins(id,email,phone,name,role,active,password_hash,created_at) VALUES(" +
  "'" + esc(phone) + "','" + esc(email) + "','" + esc(phone) + "','" + esc(name) + "','" +
  esc(role) + "',1,'" + esc(passwordHash) + "','" + esc(createdAt) + "') ON CONFLICT(id) DO NOTHING;"
);

// Usage: ADMIN_PASSWORD='long passphrase' node scripts/make-admin.mjs you@example.com
// Prints SQL; run it with Wrangler against the intended database. Password is never stored in source.
import { hashPassword } from '../src/lib.js';
const [email]=process.argv.slice(2), pw=process.env.ADMIN_PASSWORD;
if(!email||!/^\S+@\S+\.\S+$/.test(email)||!pw||pw.length<12){console.error('Provide a valid email and ADMIN_PASSWORD (12+ characters).');process.exit(1);}
console.log(`INSERT INTO admins(id,email,password_hash,created_at) VALUES('${crypto.randomUUID()}','${email.toLowerCase().replace(/'/g,"''")}','${await hashPassword(pw)}','${new Date().toISOString()}');`);

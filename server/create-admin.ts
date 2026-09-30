import { hash } from 'bcryptjs';
import { sql, pool } from './db.ts';
const [email, name = 'Administrador'] = process.argv.slice(2);
const password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 12)
  throw new Error('Use ADMIN_PASSWORD (12+ caracteres) e npm run admin:create -- email nome.');
await sql("insert into users(name,email,password_hash,role) values($1,$2,$3,'admin')", [
  name,
  email.toLowerCase(),
  await hash(password, 12),
]);
console.log('Administrador criado.');
await pool.end();

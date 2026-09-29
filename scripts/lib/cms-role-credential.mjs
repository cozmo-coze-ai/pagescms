import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';

// PostgreSQL accepts a SCRAM verifier as the CREATE ROLE password value.
// Only the verifier goes into the owner-run SQL; the random password stays
// in the protected local credential store, outside source and SQL history.
export function cmsRoleVerifier(password) {
  if (!/^[A-Za-z0-9_-]{43,}$/.test(password)) {
    throw new Error('Use a cryptographically random base64url CMS password.');
  }
  const salt = randomBytes(16);
  const iterations = 4096;
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest('base64');
  const serverKey = createHmac('sha256', salted).update('Server Key').digest('base64');
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey}:${serverKey}`;
}

export function renderCmsRoleSql(template, password) {
  const marker = '__CMS_PASSWORD_SCRAM_VERIFIER__';
  if (template.split(marker).length !== 2) throw new Error('Expected exactly one credential placeholder.');
  return template.replace(marker, () => cmsRoleVerifier(password));
}

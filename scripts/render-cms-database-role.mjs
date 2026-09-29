import { readFileSync, writeFileSync } from 'node:fs';
import { renderCmsRoleSql } from './lib/cms-role-credential.mjs';

const output = process.argv[2];
if (!output || !process.env.CMS_ROLE_SETUP_PASSWORD) throw new Error('Use prepare-cms-database-role.ps1.');
const template = readFileSync(new URL('./provision-cms-database-role.sql', import.meta.url), 'utf8');
const sql = renderCmsRoleSql(template, process.env.CMS_ROLE_SETUP_PASSWORD);
delete process.env.CMS_ROLE_SETUP_PASSWORD;
writeFileSync(output, sql, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
console.log('Private CMS setup SQL generated; password omitted from SQL.');

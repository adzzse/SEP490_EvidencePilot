const XLSX = require('xlsx');
const path = 'D:/FPT/FA26/SEP490/Prototype_3/SEP490_EvidencePilot/BE/src/main/resources/DataDemo/seed.xlsx';
const wb = XLSX.readFile(path);
const rows = XLSX.utils.sheet_to_json(wb.Sheets.users, { defval: '' });
const byRole = {};
for (const r of rows) {
  byRole[r.role] = byRole[r.role] || [];
  byRole[r.role].push(r.email);
}
for (const [role, emails] of Object.entries(byRole)) {
  console.log(`${role} (${emails.length}):`, emails.slice(0, 8).join(', '));
}
const src = XLSX.utils.sheet_to_json(wb.Sheets.sources, { defval: '' });
console.log('sample source:', JSON.stringify(src[0]));
const proj = XLSX.utils.sheet_to_json(wb.Sheets.projects, { defval: '' });
console.log('sample project:', JSON.stringify(proj[0]));

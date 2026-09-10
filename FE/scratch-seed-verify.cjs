const XLSX = require('xlsx');
const path = 'D:/FPT/FA26/SEP490/Prototype_3/SEP490_EvidencePilot/BE/src/main/resources/DataDemo/seed.xlsx';
const wb = XLSX.readFile(path);
const rows = XLSX.utils.sheet_to_json(wb.Sheets.collections, { defval: '' });
const users = XLSX.utils.sheet_to_json(wb.Sheets.users, { defval: '' });
const srcDois = new Set(
  XLSX.utils.sheet_to_json(wb.Sheets.sources, { defval: '' }).map(r => String(r.doi).trim().toLowerCase()),
);
const instructors = new Set(
  users.filter(u => u.role === 'INSTRUCTOR').map(u => String(u.email).trim().toLowerCase()),
);
let bad = 0;
const perOwner = {};
for (const r of rows) {
  const owner = String(r.owner_email).trim().toLowerCase();
  perOwner[owner] = perOwner[owner] || [];
  const dois = String(r.source_dois).split(';').map(s => s.trim()).filter(Boolean);
  perOwner[owner].push(dois.length);
  if (!r.collection_title) { console.log('BAD blank title'); bad += 1; }
  if (!instructors.has(owner)) { console.log('BAD owner', r.owner_email); bad += 1; }
  for (const d of dois) {
    if (!srcDois.has(d.toLowerCase())) { console.log('BAD doi not in sources:', d); bad += 1; }
  }
}
console.log('rows:', rows.length, 'bad:', bad);
for (const [o, counts] of Object.entries(perOwner)) {
  console.log(o, '-> collections:', counts.length, 'sizes:', counts.join(','));
}

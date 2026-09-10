const XLSX = require('xlsx');
const path = 'D:/FPT/FA26/SEP490/Prototype_3/SEP490_EvidencePilot/BE/src/main/resources/DataDemo/seed.xlsx';
const wb = XLSX.readFile(path);
const aoa = name => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
const objs = name => XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });

const OWNER = 'instructor@evidencepilot.dev';

// 1. Users: add the env-seeded instructor account.
const users = aoa('users');
users.push([OWNER, 'Test', 'Instructor', 'INSTRUCTOR', '', '']);
wb.Sheets.users = XLSX.utils.aoa_to_sheet(users);
console.log('users:', users.length - 1);

// 2. Move the 4 anchor collections (7/6/8/6 sources) to the new owner.
const colls = aoa('collections');
for (let i = 1; i <= 4; i++) colls[i][2] = OWNER;

// 3. Give linh.tran 3 replacement collections so both instructors are covered.
const keptDois = objs('sources').slice(0, 60).map(r => String(r.doi).trim()).filter(Boolean);
let cursor = 27;
const take = n => {
  const out = [];
  for (let i = 0; i < n; i++) { out.push(keptDois[cursor % keptDois.length]); cursor += 1; }
  return out.join('; ');
};
colls.push(
  ['Retrieval Fundamentals', 'Seed collection for visual-map demos (4 sources)', 'linh.tran@ep.edu', take(4)],
  ['Evaluation Essentials', 'Seed collection for visual-map demos (4 sources)', 'linh.tran@ep.edu', take(4)],
  ['RAG Case Studies II', 'Seed collection for visual-map demos (3 sources)', 'linh.tran@ep.edu', take(3)],
);
wb.Sheets.collections = XLSX.utils.aoa_to_sheet(colls);
console.log('collections:', colls.length - 1);

// 4. Memberships: owner joins every project behind their collections' DOIs.
const doiToProject = {};
for (const r of objs('sources')) doiToProject[String(r.doi).trim().toLowerCase()] = r.project_title;
const anchorDois = [];
for (let i = 1; i <= 4; i++) {
  for (const d of String(colls[i][3]).split(';')) anchorDois.push(d.trim().toLowerCase());
}
const projects = [...new Set(anchorDois.map(d => doiToProject[d]).filter(Boolean))];
const members = aoa('members');
const have = new Set(members.slice(1).map(r => `${r[0]}|${String(r[1]).toLowerCase()}`));
let added = 0;
for (const p of projects) {
  const key = `${p}|${OWNER}`;
  if (!have.has(key)) {
    members.push([p, OWNER, 'INSTRUCTOR']);
    have.add(key);
    added += 1;
  }
}
wb.Sheets.members = XLSX.utils.aoa_to_sheet(members);
console.log('members:', members.length - 1, `(+${added} for ${OWNER}, ${projects.length} projects)`);

XLSX.writeFile(wb, path);
console.log('done');

const XLSX = require('xlsx');
const path = 'D:/FPT/FA26/SEP490/Prototype_3/SEP490_EvidencePilot/BE/src/main/resources/DataDemo/seed.xlsx';
const wb = XLSX.readFile(path);
const rows = XLSX.utils.sheet_to_json(wb.Sheets.sources, { defval: '' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let ok = 0, notFound = 0, other = 0;
  const bad = [];
  for (const r of rows) {
    const doi = String(r.doi).trim();
    try {
      const res = await fetch(`https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?mailto=seedcheck@evidencepilot.test`);
      if (res.status === 200) ok += 1;
      else if (res.status === 404) { notFound += 1; bad.push(doi); }
      else { other += 1; bad.push(`${doi} (HTTP ${res.status})`); }
    } catch (e) { other += 1; bad.push(`${doi} (ERR ${e.message})`); }
    await sleep(150);
  }
  console.log(`ok=${ok} notFound=${notFound} other=${other}`);
  console.log(bad.join('\n'));
})();

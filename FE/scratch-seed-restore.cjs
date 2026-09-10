// Re-applies the three seed adjustments to the restored fixture:
// (1) sources 136 -> first 60 rows, (2) +30 collections sheet,
// (3) every 5th project -> CUSTOM (skipping standard-stub paper projects).
const XLSX = require('xlsx');
const path = 'D:/FPT/FA26/SEP490/Prototype_3/SEP490_EvidencePilot/BE/src/main/resources/DataDemo/seed.xlsx';
const wb = XLSX.readFile(path);
const aoa = name => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });

// 1. Trim sources.
const sources = aoa('sources');
wb.Sheets.sources = XLSX.utils.aoa_to_sheet([sources[0], ...sources.slice(1, 61)]);
const dois = wb.Sheets.sources
  ? XLSX.utils.sheet_to_json(wb.Sheets.sources, { defval: '' }).slice(0, 60).map(r => String(r.doi).trim()).filter(Boolean)
  : [];
console.log('sources kept:', dois.length);

// 2. Collections sheet.
const instructors = [
  'linh.tran@ep.edu',
  'khoa.nguyen@ep.edu',
  'mai.le@ep.edu',
  'duc.pham@ep.edu',
  'huong.vu@ep.edu',
];
const topicNames = [
  'Dense Retrieval Methods', 'Reranking Strategies', 'Citation Faithfulness',
  'Vietnamese QA Resources', 'Evaluation Benchmarks', 'Query Expansion',
  'Passage Indexing', 'Neural Rankers Survey', 'RAG Hallucination Studies',
  'Multilingual Embeddings', 'Long-Context Retrieval', 'Hybrid Search Systems',
  'Document Understanding', 'Zero-Shot Ranking', 'Feedback Learning',
  'Evidence Grounding', 'Cross-Encoder Models', 'Bi-Encoder Architectures',
  'Knowledge Distillation IR', 'Semantic Matching Classics', 'BM25 Baselines',
  'Transformer Explainability', 'Active Learning Labels', 'Synthetic Queries',
  'Hard Negative Mining', 'Late Interaction Models', 'Sparse Representations',
  'Table Retrieval', 'Conversational Search', 'Production RAG Case Studies',
];
const rows = [];
let doiCursor = 0;
const take = n => {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(dois[doiCursor % dois.length]);
    doiCursor += 1;
  }
  return out.join('; ');
};
const push = (title, owner, count) => {
  rows.push([title, `Seed collection for visual-map demos (${count} sources)`, owner, take(count)]);
};
push(topicNames[0], instructors[0], 7);
push(topicNames[1], instructors[0], 6);
push(topicNames[2], instructors[0], 8);
push(topicNames[3], instructors[0], 6);
let ti = 4;
for (let k = 0; k < 26; k++) {
  const owner = instructors[1 + (k % 4)];
  push(topicNames[ti % topicNames.length], owner, 3 + (k % 3));
  ti += 1;
}
wb.Sheets.collections = XLSX.utils.aoa_to_sheet([
  ['collection_title', 'description', 'owner_email', 'source_dois'],
  ...rows,
]);
wb.SheetNames = wb.SheetNames.filter(n => n !== 'collections');
wb.SheetNames.push('collections');
console.log('collections rows:', rows.length, 'unique titles:', new Set(rows.map(r => r[0])).size);

// 3. CUSTOM projects.
const projects = aoa('projects');
const papers = XLSX.utils.sheet_to_json(wb.Sheets.papers, { defval: '' });
const stubProjects = new Set(papers.filter(r => r.paper_standard).map(r => r.project_title));
const TITLE_COL = projects[0].indexOf('project_title');
const STD_COL = projects[0].indexOf('target_standard');
let changed = 0;
for (let i = 1; i < projects.length; i++) {
  if ((i - 1) % 5 === 4 && !stubProjects.has(projects[i][TITLE_COL])) {
    projects[i][STD_COL] = 'CUSTOM';
    changed += 1;
  }
}
wb.Sheets.projects = XLSX.utils.aoa_to_sheet(projects);
console.log('CUSTOM projects:', changed);

XLSX.writeFile(wb, path);
console.log('sheets:', wb.SheetNames.join(', '));
console.log('done');

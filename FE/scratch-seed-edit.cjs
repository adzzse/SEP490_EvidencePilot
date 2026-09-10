const XLSX = require('xlsx');
const path = 'D:/FPT/FA26/SEP490/Prototype_3/SEP490_EvidencePilot/BE/src/main/resources/DataDemo/seed.xlsx';
const wb = XLSX.readFile(path);

const aoa = name => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });

// 1. Trim sources to the first 60 data rows.
const sources = aoa('sources');
const keptSources = [sources[0], ...sources.slice(1, 61)];
console.log('sources kept:', keptSources.length - 1);
wb.Sheets.sources = XLSX.utils.aoa_to_sheet(keptSources);
const dois = keptSources.slice(1).map(r => String(r[1]).trim()).filter(Boolean);

// 2. Collections sheet: 30 rows. First instructor gets 4 visual-map
// collections (6-8 sources each); the rest split across other instructors.
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
// Anchor instructor: 4 collections x 6-8 sources.
push(topicNames[0], instructors[0], 7);
push(topicNames[1], instructors[0], 6);
push(topicNames[2], instructors[0], 8);
push(topicNames[3], instructors[0], 6);
// Remaining 26 across the other four instructors, 3-5 sources each.
let ti = 4;
for (let k = 0; k < 26; k++) {
  const owner = instructors[1 + (k % 4)];
  push(topicNames[ti % topicNames.length] + (ti >= topicNames.length ? ` ${Math.floor(ti / topicNames.length) + 1}` : ''), owner, 3 + (k % 3));
  ti += 1;
}
console.log('collections rows:', rows.length);
const titles = new Set(rows.map(r => r[0]));
console.log('unique titles:', titles.size);
wb.Sheets.collections = XLSX.utils.aoa_to_sheet([
  ['collection_title', 'description', 'owner_email', 'source_dois'],
  ...rows,
]);
// Place collections right after papers.
wb.SheetNames = wb.SheetNames.filter(n => n !== 'collections');
wb.SheetNames.push('collections');

XLSX.writeFile(wb, path);
console.log('sheets now:', wb.SheetNames);
console.log('done');

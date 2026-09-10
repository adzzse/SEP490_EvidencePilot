// Parses the "Paper Info" workspace section (ingested frontmatter snapshot)
// so displays can follow section edits instead of the extraction snapshot.
const INFO_TITLE = 'paper info';
const LABEL = /^\\textbf\{([^}:]+):\}\s*([\s\S]*)$/;

function splitList(value) {
  return String(value || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean);
}

export function parsePaperInfoSection(sections) {
  const section = (sections || []).find(
    s => String(s.sectionTitle || '').trim().toLowerCase() === INFO_TITLE,
  );
  if (!section || !section.contentTex) return null;
  const out = { title: '', authors: [], affiliations: [], emails: [], doi: '', keywords: '' };
  let found = false;
  for (const para of String(section.contentTex).split(/\n\s*\n/)) {
    const match = para.trim().match(LABEL);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (!value) continue;
    found = true;
    if (key === 'title') out.title = value;
    else if (key === 'authors') out.authors = splitList(value);
    else if (key === 'affiliations') out.affiliations = splitList(value);
    else if (key === 'emails') out.emails = splitList(value);
    else if (key === 'doi') out.doi = value;
    else if (key === 'keywords') out.keywords = value;
  }
  return found ? out : null;
}

// Per-field merge: edited section values win, extraction metadata fills gaps.
export function mergePaperMetadata(apiMetadata, info) {
  const apiAuthors = (apiMetadata?.authors || []).map(a => a.name).filter(Boolean);
  const apiAffiliations = [
    ...new Set((apiMetadata?.authors || []).flatMap(a => a.affiliations || []).filter(Boolean)),
  ];
  return {
    title: info?.title || apiMetadata?.title || '',
    authors: info?.authors?.length ? info.authors : apiAuthors,
    affiliations: info?.affiliations?.length ? info.affiliations : apiAffiliations,
    doi: info?.doi || apiMetadata?.doi || '',
    keywords: info?.keywords || apiMetadata?.keywords || '',
  };
}

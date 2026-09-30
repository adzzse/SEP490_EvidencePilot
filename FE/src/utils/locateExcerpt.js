// rationale: shared click-to-locate for reference-check cards (student Source
// tab + instructor Result tab). Tries the full entry text, then progressively
// shorter prefixes — the check runs on live content while review shows the
// submitted snapshot, so minor drift must not fail the locate. Transient
// editor flash only, never an anchor.
export function locateExcerptInEditor(editor, rawText) {
  const query = (rawText || '').replace(/\s+/g, ' ').trim();
  if (!editor || !query) return false;
  for (const length of [query.length, 200, 120, 80, 50]) {
    if (length > query.length) continue;
    const needle = query.slice(0, length).trim();
    if (needle.length < 20) break;
    const at = editor.findOffset?.(needle);
    if (at != null && at >= 0) {
      editor.flashRange?.(at, at + needle.length);
      return true;
    }
  }
  return false;
}

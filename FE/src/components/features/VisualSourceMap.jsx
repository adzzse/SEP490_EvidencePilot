import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

// ponytail: vis-network/vis-data removed (~400kB). Plain list replaces force graph.
// Reintroduce graph only if user research shows list hurts comprehension.
export default function VisualSourceMap({
  sources = [],
  aiSourceMatches = {},
}) {
  const { t } = useTranslation();

  const findings = useMemo(() => {
    return Object.entries(aiSourceMatches).map(([idx, candidates]) => ({
      idx: Number(idx),
      candidates: candidates || [],
    })).filter(f => f.candidates.length > 0);
  }, [aiSourceMatches]);

  if (sources.length === 0 && findings.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-(--text-tertiary)">
        <svg className="w-10 h-10 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10 13a5 5 0 007.54.54l2-2a5 5 0 00-7.07-7.07l-1.15 1.15m2.68 5.38a5 5 0 00-7.54-.54l-2 2a5 5 0 007.07 7.07l1.15-1.15" /></svg>
        <p className="text-xs font-semibold">{t('visualMapEmpty') || 'No sources or citations to display'}</p>
        <p className="text-[10px] mt-1">{t('visualMapDesc') || 'Run AI Review to see source connections'}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div>
        <h4 className="text-[10px] font-black uppercase tracking-wider text-(--text-tertiary) mb-2">{t('sourceLegend') || 'Sources'} ({sources.length})</h4>
        <ul className="space-y-1.5">
          {sources.map((s, i) => (
            <li key={s.id || i} className="flex items-center gap-2 rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-xs">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: '#7c3aed' }} />
              <span className="truncate font-medium text-(--text-primary)">{s.title || s.originalFilename || `Source ${i + 1}`}</span>
            </li>
          ))}
        </ul>
      </div>
      {findings.length > 0 && (
        <div>
          <h4 className="text-[10px] font-black uppercase tracking-wider text-(--text-tertiary) mb-2">{t('findingLegend') || 'Findings'} ({findings.length})</h4>
          <ul className="space-y-2">
            {findings.map(f => (
              <li key={f.idx} className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
                <p className="text-xs font-bold text-amber-800">Finding {f.idx + 1} <span className="font-normal text-amber-700">— {f.candidates.length} source(s)</span></p>
                <ul className="mt-1.5 space-y-1">
                  {f.candidates.map((c, ci) => {
                    const sid = c.documentId || c.sourceId || '';
                    const src = sources.find(s => String(s.id) === String(sid));
                    const label = c.title || src?.title || src?.originalFilename || sid || `Source ${ci + 1}`;
                    return <li key={ci} className="text-[11px] text-(--text-secondary) truncate">→ {label}</li>;
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

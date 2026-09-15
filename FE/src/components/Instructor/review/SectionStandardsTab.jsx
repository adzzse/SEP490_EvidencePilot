import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../services/api.js';

// ponytail: standards viewer reusing embedded v2 snapshot data first, live GET latest as fallback.
// Embedded = historical truth; live = current (labeled, never presented as historical).
export default function SectionStandardsTab({ review, selectedSection }) {
  const { t } = useTranslation();
  const [live, setLive] = useState(null);
  const [liveState, setLiveState] = useState('IDLE');

  const snapshotSection = (() => {
    const papers = review.submissionSnapshot?.papers || [];
    for (const paper of papers) {
      const found = (paper.sections || []).find(s => String(s.id) === String(selectedSection?.id));
      if (found) return found;
    }
    return null;
  })();
  const embedded = snapshotSection?.standardEvaluation || null;

  useEffect(() => {
    if (embedded || !selectedSection?.documentId || !selectedSection?.id) return;
    let cancelled = false;
    setLiveState('LOADING');
    api.get(`/api/papers/${selectedSection.documentId}/sections/${selectedSection.id}/standard-evaluation`)
      .then(r => { if (!cancelled) { setLive(r.data || null); setLiveState(r.data ? 'AVAILABLE' : 'MISSING'); } })
      .catch(err => { if (!cancelled) setLiveState(err?.response?.status === 404 ? 'MISSING' : 'ERROR'); });
    return () => { cancelled = true; };
  }, [embedded, selectedSection]);

  if (!selectedSection) return <p className="text-xs text-(--text-tertiary) italic">{t('instructor.review.selectSectionFeedback')}</p>;

  const shown = embedded
    ? { status: embedded.status, requirements: embedded.requirements || [], result: embedded.result || null,
        errorCode: embedded.errorCode || null, updatedAt: embedded.updatedAt || null, historical: true }
    : live
      ? { status: live.status, requirements: live.requirements || [], result: live.result || null,
          errorCode: live.errorCode || null, updatedAt: live.updatedAt || null, stale: live.stale, historical: false }
      : null;

  if (!embedded && liveState === 'LOADING') return <p role="status" className="text-xs text-(--text-tertiary)">{t('loading')}</p>;
  if (!shown) {
    return <p className="text-xs text-(--text-tertiary) italic">{t(`instructor.review.standard${liveState === 'ERROR' ? 'LoadError' : 'Missing'}`)}</p>;
  }

  const items = shown.result?.items || [];
  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-1 text-[10px] font-bold ${shown.stale || shown.status === 'STALE' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {shown.stale || shown.status === 'STALE' ? t('instructor.review.standardStale') : shown.status}
        </span>
        {shown.updatedAt && <span className="text-[10px] text-(--text-tertiary)">{new Date(shown.updatedAt).toLocaleString()}</span>}
      </div>
      <p className="text-[10px] italic text-(--text-tertiary)">
        {shown.historical ? t('instructor.review.standardCapturedAtSubmission') : t('instructor.review.standardCurrentNotice')}
      </p>
      {shown.errorCode && <p className="font-bold text-rose-600">{shown.errorCode}</p>}
      {shown.result?.summary && <p className="leading-relaxed text-(--text-secondary)">{shown.result.summary}</p>}
      {items.length > 0 ? (
        <ul className="max-h-[40vh] space-y-2 overflow-y-auto pr-1 hide-scrollbar">
          {items.map((item, i) => (
            <li key={i} className="rounded-xl border border-(--border-light) bg-(--surface-secondary) p-3 space-y-1">
              <p className="font-bold text-(--text-primary)">{item.requirement}</p>
              <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold ${item.verdict === 'MET' ? 'bg-emerald-100 text-emerald-700' : item.verdict === 'PARTIAL' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{item.verdict}</span>
              {item.evidence && <p className="italic text-(--text-secondary)">“{item.evidence}”</p>}
              {item.reason && <p className="text-(--text-secondary)">{item.reason}</p>}
              {item.suggestion && <p className="text-(--text-secondary)"><b>{t('instructor.review.standardSuggestion')}:</b> {item.suggestion}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-(--text-tertiary) italic">{t('instructor.review.standardNoItems')}</p>
      )}
    </div>
  );
}

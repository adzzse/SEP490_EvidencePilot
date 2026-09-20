import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { roundNumberFor } from '../../utils/reviewRounds.js';
import { formatDateTime } from '../../utils/formatters/date.js';

const control = 'min-w-0 rounded-md border border-(--border) bg-(--surface) px-2 py-1.5 text-xs text-(--text-primary) focus-visible:ring-2 focus-visible:ring-(--brand)';
const FEEDBACK_REQUEST_STATUSES = new Set(['PENDING', 'RETURNED', 'REVIEWED', 'REJECTED']);

// rationale: plain stacked cards in normal flow — no anchor-mirrored absolute
// layout (it left giant gaps when anchors sat far apart), no connector line,
// no Go-to dropdown. Card click + editor-highlight click still select.
export default function FeedbackPanel({ feedback, sectionId, activeId, onSelect, onClose, visible,
  requestId, setRequestId, scope, setScope,
  userProjectRole = 'MEMBER', currentUserId = null }) {
  const { t, i18n } = useTranslation();
  const isLeader = userProjectRole === 'LEADER';
  const scrollerRef = useRef(null);
  const filtered = useMemo(() => feedback.items.filter(item => {
    if (requestId && String(item.requestId) !== String(requestId)) return false;
    if (scope !== 'project' && String(item.sectionId) !== String(sectionId)) return false;
    // Members see only their own assigned sections (mirrors the server rule);
    // leaders see the whole round. Unknown user degrades to unfiltered display.
    if (!isLeader && currentUserId != null && String(item.assignedUserId ?? '') !== String(currentUserId)) return false;
    return true;
  }), [feedback.items, requestId, scope, sectionId, isLeader, currentUserId]);

  useEffect(() => {
    if (!visible || !activeId || !scrollerRef.current) return;
    const card = scrollerRef.current.querySelector(`[data-feedback-card="${activeId}"]`);
    const viewport = scrollerRef.current.getBoundingClientRect();
    const bounds = card?.getBoundingClientRect();
    if (bounds && (bounds.bottom < viewport.top || bounds.top > viewport.bottom)) {
      scrollerRef.current.scrollTop += bounds.top - viewport.top - 12;
    }
  }, [activeId, visible, filtered.length]);

  const select = item => onSelect(item);
  const date = value => value ? formatDateTime(value, i18n.language) : '';
  return <section aria-label={t('studentFeedback.title')} className="flex h-full min-h-0 flex-col text-(--text-primary)"
    onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="shrink-0 border-b border-(--border) bg-(--surface) px-3 py-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">{t('studentFeedback.title')}</h2>
        <div className="flex items-center gap-1">
          <button type="button" className={control} onClick={feedback.refresh} disabled={feedback.loading} aria-label={t('studentFeedback.refresh')}>↻</button>
          <button type="button" className={control} onClick={onClose} aria-label={t('studentFeedback.close')}>×</button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select className={control} value={scope} onChange={event => setScope(event.target.value)} aria-label={t('studentFeedback.scope')}>
          <option value="section">{t('studentFeedback.thisSection')}</option><option value="project">{t('studentFeedback.wholeProject')}</option>
        </select>
        {isLeader ? (
          <select className={control} value={requestId || ''} onChange={event => setRequestId(event.target.value || null)} aria-label={t('studentFeedback.roundFilter')}>
            {feedback.requests.map((request) => <option key={request.id} value={request.id}>
              {t('studentFeedback.round', { number: roundNumberFor(feedback.requests, request.id) ?? '?' })} · {t(`status.${FEEDBACK_REQUEST_STATUSES.has(request.status) ? request.status : 'UNKNOWN'}`)}
            </option>)}
          </select>
        ) : (
          <p className="text-[11px] font-semibold self-center text-(--text-secondary)">
            {(() => {
              const current = feedback.requests.find(request => String(request.id) === String(requestId));
              if (!current) return t('studentFeedback.empty');
              const number = roundNumberFor(feedback.requests, current.id) ?? '?';
              return `${t('studentFeedback.round', { number })} · ${t(`status.${FEEDBACK_REQUEST_STATUSES.has(current.status) ? current.status : 'UNKNOWN'}`)}`;
            })()}
          </p>
        )}
      </div>
    </div>
    {feedback.error && <div role="alert" className="m-3 rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-300">
      <p>{t(feedback.error === 403 ? 'studentFeedback.accessDenied' : 'studentFeedback.loadError')}</p>
      <button type="button" onClick={feedback.refresh} className="mt-2 underline font-bold">{t('retry')}</button>
    </div>}
    <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-(--surface-secondary)/50 p-3" data-testid="feedback-scroller">
      {feedback.loading && <p role="status" className="py-3 text-xs text-(--text-secondary)">{t('studentFeedback.loading')}</p>}
      {!feedback.loading && !feedback.error && filtered.length === 0 && <p className="py-6 text-center text-sm text-(--text-secondary)">{t('studentFeedback.empty')}</p>}
      <div className="space-y-3">
        {filtered.map(item => {
          const anchor = item.anchor;
          const active = item.id === activeId;
          const canNavigate = item.sectionId && String(item.sectionId) !== String(sectionId);
          return <article key={item.id}
            data-feedback-card={item.id} aria-label={t('studentFeedback.card', { section: item.sectionTitle || '' })}
            className={`rounded-lg border bg-(--surface) p-3 text-xs shadow-sm ${active ? 'border-teal-600 ring-1 ring-teal-600' : 'border-(--border)'}`}>
            <button type="button" className="w-full text-left rounded focus-visible:ring-2 focus-visible:ring-(--brand)" onClick={() => select(item)} aria-expanded={active}>
              <span className="flex justify-between gap-2 font-semibold">
                <span>{item.instructorName || t('instructor')} · {item.sectionTitle}{isLeader && item.assignedUserName ? ` · ${t('feedbackAssignee')}: ${item.assignedUserName}` : ''} · {t('studentFeedback.round', { number: item.roundNumber || '?' })}</span>
                <span className="shrink-0 text-[10px] font-normal text-(--text-tertiary)">{date(item.createdAt)}</span>
              </span>
              <span className={`mt-2 block whitespace-pre-wrap break-words leading-relaxed ${active ? '' : 'line-clamp-3'}`}>{item.content}</span>
            </button>
            <div className="mt-2 rounded-md border border-(--border) bg-(--surface-secondary) px-2 py-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-(--text-tertiary)">{t('studentFeedback.passage')}</p>
              {anchor?.original?.exact
                ? <p className="mt-1 whitespace-pre-wrap break-words font-mono leading-relaxed">“{anchor.original.exact}”</p>
                : <p className="mt-1 italic text-(--text-secondary)">{t('studentFeedback.wholeSection')}{item.lineReference ? ` · ${item.lineReference}` : ''}</p>}
            </div>
            {active && <div className="mt-3 space-y-3">
              {canNavigate && <button type="button" className={`${control} font-semibold`} onClick={() => select(item)}>{t('studentFeedback.goToText')}</button>}
              {(item.attachments || []).length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-(--text-tertiary)">{t('studentFeedback.providedImages')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {item.attachments.map(attachment => (
                      <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" title={attachment.mimeType}>
                        <img src={attachment.url} alt="" loading="lazy" decoding="async" className="h-14 w-14 rounded-md border border-(--border) object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {(item.replies || []).length > 0 && (
                <details className="rounded-md border border-(--border) bg-(--surface-secondary) px-2 py-1.5">
                  <summary className="cursor-pointer font-medium">{t('studentFeedback.legacyDiscussion')}</summary>
                  <ul className="mt-2 space-y-1.5">
                    {item.replies.map(reply => (
                      <li key={reply.id} className="rounded-md bg-(--surface-secondary)/70 px-2 py-1.5">
                        <p className="text-[9px] font-bold text-(--text-tertiary)">
                          {reply.authorName || reply.authorRole} · {date(reply.createdAt)}
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap break-words leading-relaxed">{reply.content}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>}
          </article>;
        })}
      </div>
    </div>
  </section>;
}

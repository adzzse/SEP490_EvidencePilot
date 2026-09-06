import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { placeFeedbackCards } from '../../utils/student/feedbackAnchors.js';

const control = 'min-w-0 rounded-md border border-(--border) bg-(--surface) px-2 py-1.5 text-xs text-(--text-primary) focus-visible:ring-2 focus-visible:ring-(--brand)';

export default function FeedbackPanel({ feedback, sectionId, activeId, onSelect, onClose, visible,
  positions, narrow, requestId, setRequestId, scope, setScope, overlapIds = [] }) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState('all');
  const [layout, setLayout] = useState([]);
  const scrollerRef = useRef(null);
  const cardsRef = useRef(new Map());
  const [sizeVersion, setSizeVersion] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  useEffect(() => setStatus('all'), [activeId]);
  const filtered = useMemo(() => feedback.items.filter(item =>
    (!requestId || item.requestId === requestId)
    && (scope === 'project' || String(item.sectionId) === String(sectionId))
    && (status === 'all' || item.answered === (status === 'answered'))), [feedback.items, requestId, scope, sectionId, status]);
  const byId = useMemo(() => new Map(positions.map(position => [position.id, position])), [positions]);
  const anchored = !narrow && scope === 'section';
  const visibleItems = anchored ? filtered.filter(item => {
    const position = byId.get(item.id);
    return item.id === activeId || (position?.top != null && position.bottom >= position.viewportTop - 40
      && position.top <= position.viewportBottom + 40) || position?.from == null;
  }) : filtered;
  const ids = visibleItems.map(item => item.id).join(',');

  useEffect(() => {
    if (!visible) return;
    let frame;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setSizeVersion(version => version + 1));
    });
    if (scrollerRef.current) observer.observe(scrollerRef.current);
    cardsRef.current.forEach(card => observer.observe(card));
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [ids, visible, activeId]);

  useLayoutEffect(() => {
    if (!visible || !anchored || !scrollerRef.current) return;
    const viewport = scrollerRef.current.getBoundingClientRect();
    const scroll = scrollerRef.current.scrollTop;
    const contentTop = viewport.top + parseFloat(getComputedStyle(scrollerRef.current).paddingTop);
    const measured = visibleItems.filter(item => byId.get(item.id)?.top != null).map(item => ({
      id: item.id, top: byId.get(item.id).top - contentTop + scroll, scroll,
      height: cardsRef.current.get(item.id)?.getBoundingClientRect().height ?? 96,
    }));
    const packed = placeFeedbackCards(measured, activeId);
    let bottom = Math.max(0, ...packed.map(card => card.y + card.height + 12));
    visibleItems.filter(item => !measured.some(card => card.id === item.id)).forEach(item => {
      const height = cardsRef.current.get(item.id)?.getBoundingClientRect().height ?? 96;
      packed.push({ id: item.id, top: null, y: bottom, height });
      bottom += height + 12;
    });
    setLayout(previous => JSON.stringify(previous) === JSON.stringify(packed) ? previous : packed);
  }, [positions, ids, visible, anchored, activeId, sizeVersion]);

  useEffect(() => {
    if (!visible || !activeId || !scrollerRef.current) return;
    const card = cardsRef.current.get(activeId);
    const viewport = scrollerRef.current.getBoundingClientRect();
    const bounds = card?.getBoundingClientRect();
    if (bounds && (bounds.bottom < viewport.top || bounds.top > viewport.bottom)) {
      scrollerRef.current.scrollTop += bounds.top - viewport.top - 12;
    }
  }, [activeId, visible, ids]);

  const select = item => onSelect(item);
  const listHeight = Math.max(0, ...layout.map(card => card.y + card.height + 12));
  const layoutById = new Map(layout.map(card => [card.id, card]));
  const date = value => value ? new Date(value).toLocaleString(i18n.language === 'vi' ? 'vi-VN' : 'en-US') : '';
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
      <details open={!narrow} className="text-xs">
      <summary className="cursor-pointer py-1 text-(--text-secondary)">{t('studentFeedback.filters')}</summary>
      <div className="grid grid-cols-2 gap-2 mt-1">
        <select className={control} value={scope} onChange={event => setScope(event.target.value)} aria-label={t('studentFeedback.scope')}>
          <option value="section">{t('studentFeedback.thisSection')}</option><option value="project">{t('studentFeedback.wholeProject')}</option>
        </select>
        <select className={control} value={status} onChange={event => setStatus(event.target.value)} aria-label={t('studentFeedback.filter')}>
          <option value="all">{t('studentFeedback.all')}</option><option value="unanswered">{t('studentFeedback.unanswered')}</option><option value="answered">{t('answered')}</option>
        </select>
      </div>
      <select className={`${control} w-full mt-2`} value={requestId || ''} onChange={event => setRequestId(event.target.value || null)} aria-label={t('studentFeedback.roundFilter')}>
        <option value="">{t('studentFeedback.allRounds')}</option>
        {feedback.requests.map((request, index) => <option key={request.id} value={request.id}>
          {t('studentFeedback.round', { number: feedback.requests.length - index })} · {t(`status.${request.status}`, { defaultValue: request.status })}
        </option>)}
      </select>
      </details>
      {!!filtered.length && <select className={`${control} w-full`} value={filtered.some(item => item.id === activeId) ? activeId : ''}
        onChange={event => { const item = filtered.find(entry => entry.id === event.target.value); if (item) select(item); }} aria-label={t('studentFeedback.navigate')}>
        <option value="">{t('studentFeedback.navigate')} ({filtered.length})</option>
        {filtered.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.sectionTitle} · {item.content.slice(0, 65)}</option>)}
      </select>}
      {overlapIds.length > 1 && <div className="flex flex-wrap items-center gap-1 text-xs" aria-label={t('studentFeedback.overlap')}>
        <span>{t('studentFeedback.overlap')}:</span>
        {overlapIds.map((id, index) => <button type="button" key={id} className={`${control} ${id === activeId ? 'font-bold ring-1 ring-teal-600' : ''}`}
          onClick={() => { const item = feedback.items.find(entry => entry.id === id); if (item) select(item); }}>{index + 1}</button>)}
      </div>}
    </div>
    {feedback.error && <div role="alert" className="m-3 rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-300">
      <p>{t(feedback.error === 403 ? 'studentFeedback.accessDenied' : 'studentFeedback.loadError')}</p>
      <button type="button" onClick={feedback.refresh} className="mt-2 underline font-bold">{t('retry')}</button>
    </div>}
    <div ref={scrollerRef} onScroll={event => setScrollTop(event.currentTarget.scrollTop)} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-(--surface-secondary)/50 p-3" data-testid="feedback-scroller">
      {feedback.loading && <p role="status" className="py-3 text-xs text-(--text-secondary)">{t('studentFeedback.loading')}</p>}
      {!feedback.loading && !feedback.error && filtered.length === 0 && <p className="py-6 text-center text-sm text-(--text-secondary)">{t('studentFeedback.empty')}</p>}
      <div className={anchored ? 'relative' : 'space-y-3'} style={anchored ? { height: listHeight || undefined, minHeight: visibleItems.length ? 100 : 0 } : undefined}>
        {visibleItems.map(item => {
          const position = byId.get(item.id);
          const anchor = position?.anchor || item.anchor;
          const locationStatus = anchor?.current?.status || (item.lineReference ? 'UNLOCATED' : 'SECTION');
          const placed = layoutById.get(item.id);
          const active = item.id === activeId;
          const canNavigate = item.sectionId && (String(item.sectionId) !== String(sectionId) || position?.from != null);
          return <article key={item.id} ref={node => { if (node) cardsRef.current.set(item.id, node); else cardsRef.current.delete(item.id); }}
            data-feedback-card={item.id} aria-label={t('studentFeedback.card', { section: item.sectionTitle || '' })}
            className={`rounded-lg border bg-(--surface) p-3 text-xs shadow-sm ${active ? 'border-teal-600 ring-1 ring-teal-600' : 'border-(--border)'}`}
            style={anchored ? { position: 'absolute', left: 10, right: 0, top: placed?.y ?? 0 } : undefined}>
            {anchored && active && placed?.top != null && <svg aria-hidden="true" className="pointer-events-none absolute overflow-visible" style={{ left: -11, top: 0, width: 11, height: 1 }}>
              <path d={`M 0 ${placed.top - placed.y + scrollTop - placed.scroll} H 4 V 16 H 11`} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-teal-600" />
            </svg>}
            <button type="button" className="w-full text-left rounded focus-visible:ring-2 focus-visible:ring-(--brand)" onClick={() => select(item)} aria-expanded={active}>
              <span className="flex justify-between gap-2 font-semibold"><span>{item.instructorName || t('instructor')}</span>
                <span className={item.answered ? 'text-teal-700 dark:text-teal-300' : 'text-(--text-secondary)'}>{item.answered ? `✓ ${t('answered')}` : t('studentFeedback.unanswered')}</span></span>
              <span className="mt-1 block text-[10px] text-(--text-secondary)">{item.sectionTitle} · {t('studentFeedback.round', { number: item.roundNumber || '?' })}</span>
              <span className={`mt-2 block whitespace-pre-wrap break-words leading-relaxed ${active ? '' : 'line-clamp-3'}`}>{item.content}</span>
            </button>
            {locationStatus !== 'ATTACHED' && <p className="mt-2 text-[11px] font-medium text-(--text-secondary)">
              {t(`studentFeedback.location.${locationStatus}`, { defaultValue: t('studentFeedback.location.UNLOCATED') })}
              {locationStatus === 'UNLOCATED' && item.lineReference ? ` · ${item.lineReference}` : ''}
            </p>}
            {active && <div className="mt-3 space-y-3">
              <p className="text-[10px] text-(--text-tertiary)">{date(item.createdAt)}</p>
              {anchor?.original?.exact && <details className="rounded-md border border-(--border) bg-(--surface-secondary) px-2 py-1.5">
                <summary className="cursor-pointer font-medium">{t('studentFeedback.original')}</summary>
                <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono leading-relaxed">{anchor.original.exact}</p>
              </details>}
              {canNavigate && <button type="button" className={`${control} font-semibold`} onClick={() => select(item)}>{t('studentFeedback.goToText')}</button>}
              {item.answered && <div className="rounded-md border-l-2 border-teal-600 bg-(--surface-secondary) p-2.5">
                <p className="font-semibold">{t('studentFeedback.reply')}</p>
                <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{item.answerContent}</p>
                <p className="mt-1 text-[10px] text-(--text-tertiary)">{date(item.answeredAt)}</p>
              </div>}
              {!item.answered && item.canAnswer && <form onSubmit={event => { event.preventDefault(); feedback.answer(item); }} className="space-y-2">
                <label className="block font-semibold" htmlFor={`feedback-answer-${item.id}`}>{t('answerFeedback')}</label>
                <textarea id={`feedback-answer-${item.id}`} className={`${control} w-full resize-y leading-relaxed`} rows={3} maxLength={20000}
                  value={feedback.drafts[item.id] || ''} onChange={event => feedback.setDraft(item.id, event.target.value)} placeholder={t('answerPlaceholder')} />
                {feedback.answerErrors[item.id] && <p role="alert" className="text-rose-600 dark:text-rose-300">{t(feedback.answerErrors[item.id] === 409 ? 'studentFeedback.replyConflict' : 'answerFailed')}</p>}
                <button type="submit" disabled={!!feedback.answeringId || !(feedback.drafts[item.id] || '').trim()}
                  className="rounded-md bg-(--brand) px-3 py-2 font-semibold text-(--on-brand) disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-teal-600">
                  {feedback.answeringId === item.id ? t('answering') : feedback.answerErrors[item.id] ? t('retry') : t('answerFeedback')}
                </button>
                <p className="text-[10px] leading-relaxed text-(--text-secondary)">{t('studentFeedback.replyHint')}</p>
              </form>}
              {!item.answered && !item.canAnswer && <p className="text-[11px] text-(--text-secondary)">{t('studentFeedback.replyUnavailable')}</p>}
            </div>}
          </article>;
        })}
      </div>
      {anchored && filtered.length > visibleItems.length && <p className="py-3 text-[11px] text-(--text-secondary)">{t('studentFeedback.offscreen', { count: filtered.length - visibleItems.length })}</p>}
    </div>
  </section>;
}

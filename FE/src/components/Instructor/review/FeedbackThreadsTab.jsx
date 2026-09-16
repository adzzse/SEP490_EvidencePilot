import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../../../utils/formatters/date.js';
import MediaAssetPicker from '../../features/MediaAssetPicker.jsx';
import { requestReanchor, usePendingReanchor } from '../../../stores/reanchorStore.js';

const LOCATION_KEYS = new Set(['ATTACHED', 'MODIFIED', 'DETACHED', 'SECTION', 'UNLOCATED']);

function stateChip(state) {
  if (state === 'RESOLVED') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  if (state === 'REJECTED') return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
}

export default function FeedbackThreadsTab({ review, selectedSection, projectId, composerFocusToken = 0 }) {
  const { t, i18n } = useTranslation();
  const {
    feedbackItems, activeRequestId, activeRequest, canCreateRoot,
    feedbackDraft, selectedAnchor, editingFeedbackId, updateFeedbackDraft,
    savingFeedback, activeFeedbackId, handleSubmitFeedback, captureSourceSelection,
    handleEditFeedback, handleCancelEdit, handleDeleteFeedback,
    prepareState, postReply, selectFeedback, errorMessage, successMessage,
  } = review;
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replyAttachments, setReplyAttachments] = useState({});
  const [pendingAttachments, setPendingAttachments] = useState({});
  const [rejectNotes, setRejectNotes] = useState({});
  const [rejectingId, setRejectingId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const pendingReanchor = usePendingReanchor();
  const composerRef = useRef(null);
  useEffect(() => {
    if (composerFocusToken > 0) composerRef.current?.focus();
  }, [composerFocusToken]);
  // ponytail: picker picks keyed by message so composer/reply drafts never mix.
  const pendingKey = editingFeedbackId || 'new';
  const pickerLabels = {
    selectMedia: t('instructor.review.selectMedia'),
    title: t('instructor.review.mediaTitle'),
    empty: t('instructor.review.mediaEmpty'),
    done: t('instructor.review.mediaDone'),
  };

  const threads = useMemo(() => (feedbackItems || [])
    .filter(item => String(item.requestId) === String(activeRequestId)
      && String(item.sectionId) === String(selectedSection?.id))
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))),
    [feedbackItems, activeRequestId, selectedSection?.id]);

  const runState = async (item, state, note) => {
    setBusyId(item.id);
    try {
      const ok = await prepareState(item, state, note);
      if (ok && state === 'REJECTED') {
        setRejectNotes(prev => ({ ...prev, [item.id]: '' }));
        setRejectingId(null);
      }
      return ok;
    } finally {
      setBusyId(current => (current === item.id ? null : current));
    }
  };

  const sendReply = async item => {
    const text = (replyDrafts[item.id] || '').trim();
    if (!text) return;
    setBusyId(item.id);
    try {
      const ids = (replyAttachments[item.id] || []).map(entry => entry.id);
      const ok = await postReply(item, text, ids);
      if (ok) {
        setReplyDrafts(prev => ({ ...prev, [item.id]: '' }));
        setReplyAttachments(prev => ({ ...prev, [item.id]: [] }));
      }
    } finally {
      setBusyId(current => (current === item.id ? null : current));
    }
  };

  const submitThread = async event => {
    event.preventDefault();
    const ids = (pendingAttachments[pendingKey] || []).map(entry => entry.id);
    const ok = await handleSubmitFeedback(event, ids);
    if (ok) setPendingAttachments(prev => ({ ...prev, [pendingKey]: [] }));
  };

  return (
    <div className="space-y-3">
      {errorMessage && <p role="alert" className="text-rose-700">{errorMessage}</p>}
      {successMessage && <p role="status" className="text-emerald-700">{successMessage}</p>}

      {canCreateRoot && (
        <form onSubmit={submitThread} className="space-y-2 rounded-xl border border-(--border-light) bg-(--surface-secondary)/50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={captureSourceSelection}
              disabled={savingFeedback}
              className="rounded-lg bg-teal-600 px-2.5 py-1.5 text-[10px] font-black text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {t('instructor.review.useSelection')}
            </button>
            <span className="text-[10px] font-semibold text-(--text-secondary)">
              {selectedAnchor
                ? t('instructor.review.selectionReady', { from: selectedAnchor.from, to: selectedAnchor.to })
                : t('instructor.review.wholeSection')}
            </span>
          </div>
          <textarea
            ref={composerRef}
            value={feedbackDraft}
            onChange={event => updateFeedbackDraft({ content: event.target.value })}
            placeholder={t('instructor.review.composerPlaceholder')}
            rows={3}
            disabled={savingFeedback}
            className="w-full rounded-lg border border-(--border) bg-(--surface) px-2.5 py-2 text-xs text-(--text-primary) focus-visible:ring-2 focus-visible:ring-(--brand)"
          />
          <MediaAssetPicker
            projectId={projectId}
            labels={pickerLabels}
            value={pendingAttachments[pendingKey] || []}
            onChange={entries => setPendingAttachments(prev => ({ ...prev, [pendingKey]: entries }))}
            disabled={savingFeedback}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={savingFeedback || !feedbackDraft.trim()}
              className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-black text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {savingFeedback ? t('saving') : editingFeedbackId ? t('instructor.review.updateFeedback') : t('instructor.review.saveFeedback')}
            </button>
            {editingFeedbackId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={savingFeedback}
                className="rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-[11px] font-bold text-(--text-secondary) disabled:opacity-50"
              >
                {t('cancel')}
              </button>
            )}
          </div>
        </form>
      )}

      {threads.length === 0 && (
        <p className="py-4 text-center text-[11px] italic text-(--text-tertiary)">
          {selectedSection ? t('instructor.review.threadsEmpty') : t('instructor.review.selectSectionFeedback')}
        </p>
      )}

      <ul className="space-y-2">
        {threads.map(item => {
          const effective = item.pendingState || item.threadState || 'OPEN';
          const location = item.anchor?.current?.status || (item.lineReference ? 'UNLOCATED' : 'SECTION');
          const active = String(item.id) === String(activeFeedbackId);
          const busy = busyId === item.id;
          return (
            <li
              key={item.id}
              className={`rounded-xl border bg-(--surface) p-3 text-xs ${active ? 'border-teal-600 ring-1 ring-teal-600' : 'border-(--border-light)'}`}
            >
              <button type="button" onClick={() => selectFeedback(item)} className="w-full text-left">
                <span className="flex flex-wrap items-center gap-1.5">
                  {!item.publishedAt && (
                    <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {t('instructor.review.draftBadge')}
                    </span>
                  )}
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase ${stateChip(effective)}`}>
                    {t(`instructor.review.state${effective.charAt(0) + effective.slice(1).toLowerCase()}`)}
                  </span>
                  {item.pendingState && item.pendingState !== item.threadState && (
                    <span className="text-[9px] font-bold text-(--text-tertiary)">
                      {t('instructor.review.pendingState')}: {item.pendingState}
                    </span>
                  )}
                  <span className="ml-auto text-[9px] text-(--text-tertiary)">
                    {formatDateTime(item.createdAt, i18n.language)}
                  </span>
                </span>
                <span className="mt-1.5 block whitespace-pre-wrap break-words leading-relaxed text-(--text-primary)">
                  {item.content}
                </span>
                <span className="mt-1 block text-[10px] text-(--text-secondary)">
                  {t(`studentFeedback.location.${LOCATION_KEYS.has(location) ? location : 'UNLOCATED'}`)}
                  {location === 'UNLOCATED' && item.lineReference ? ` · ${item.lineReference}` : ''}
                </span>
                {(location === 'DETACHED' || location === 'MODIFIED') && item.anchor?.original?.exact && (
                  <span className="mt-1 block rounded bg-(--surface-secondary) p-1.5 text-[10px] italic line-through opacity-60">
                    {t('studentFeedback.originalContext')}: {item.anchor.original.exact}
                  </span>
                )}
                {item.studentStatus && (
                  <span className="mt-1 block text-[10px] font-bold text-(--text-tertiary)">
                    {t('studentFeedback.studentState', { status: item.studentStatus })}
                    {item.studentNote ? ` · ${item.studentNote}` : ''}
                  </span>
                )}
              </button>

              {(item.attachments || []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.attachments.map(attachment => (
                    <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" title={attachment.mimeType}>
                      <img src={attachment.url} alt="" loading="lazy" decoding="async" className="h-14 w-14 rounded-lg border border-(--border) object-cover" />
                    </a>
                  ))}
                </div>
              )}

              {(item.replies || []).length > 0 && (
                <ul className="mt-2 space-y-1.5 border-t border-(--border-light) pt-2">
                  {item.replies.map(reply => (
                    <li key={reply.id} className="rounded-lg bg-(--surface-secondary)/70 px-2 py-1.5">
                      <p className="text-[9px] font-bold text-(--text-tertiary)">
                        {reply.authorName || reply.authorRole} · {formatDateTime(reply.createdAt, i18n.language)}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words leading-relaxed text-(--text-primary)">
                        {reply.content}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.canMarkDone && (
                  <button
                    type="button" disabled={busy} onClick={() => runState(item, 'RESOLVED')}
                    className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[10px] font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {t('instructor.review.resolveThread')}
                  </button>
                )}
                {item.canMarkDone && rejectingId !== item.id && (
                  <button
                    type="button" disabled={busy} onClick={() => setRejectingId(item.id)}
                    className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-[10px] font-black text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {t('instructor.review.rejectThread')}
                  </button>
                )}
                {item.canReopen && (
                  <button
                    type="button" disabled={busy} onClick={() => runState(item, 'OPEN')}
                    className="rounded-lg border border-(--border) bg-(--surface) px-2.5 py-1.5 text-[10px] font-black text-(--text-secondary) hover:bg-(--surface-secondary) disabled:opacity-50"
                  >
                    {t('instructor.review.reopenThread')}
                  </button>
                )}
                {item.canEdit && (
                  <button
                    type="button" disabled={busy} onClick={() => handleEditFeedback(item)}
                    className="rounded-lg border border-(--border) px-2.5 py-1.5 text-[10px] font-bold text-(--text-secondary) disabled:opacity-50"
                  >
                    {t('instructor.review.edit')}
                  </button>
                )}
                {item.canDelete && (
                  <button
                    type="button" disabled={busy} onClick={() => handleDeleteFeedback(item.id)}
                    className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-[10px] font-bold text-rose-600 disabled:opacity-50"
                  >
                    {t('delete')}
                  </button>
                )}
                {!item.publishedAt && item.canEdit && location !== 'ATTACHED' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      selectFeedback(item);
                      requestReanchor({ threadId: item.id, sectionId: item.sectionId });
                    }}
                    className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold disabled:opacity-50 ${
                      String(pendingReanchor?.threadId) === String(item.id)
                        ? 'border-teal-600 bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300'
                        : 'border-(--border) text-(--text-secondary)'
                    }`}
                  >
                    {t('instructor.review.reanchorThread')}
                  </button>
                )}
              </div>

              {rejectingId === item.id && (
                <div className="mt-2 space-y-1.5 rounded-lg border border-rose-200 bg-rose-50/50 p-2 dark:bg-rose-950/20">
                  <textarea
                    value={rejectNotes[item.id] || ''}
                    onChange={event => setRejectNotes(prev => ({ ...prev, [item.id]: event.target.value }))}
                    placeholder={t('instructor.review.rejectNotePlaceholder')}
                    rows={2}
                    disabled={busy}
                    className="w-full rounded-lg border border-(--border) bg-(--surface) px-2 py-1.5 text-xs text-(--text-primary)"
                  />
                  <p className="text-[10px] italic text-(--text-tertiary)">{t('instructor.review.rejectNoteRequired')}</p>
                  <div className="flex gap-1.5">
                    <button
                      type="button" disabled={busy}
                      onClick={() => runState(item, 'REJECTED', rejectNotes[item.id])}
                      className="flex-1 rounded-lg bg-rose-600 px-2 py-1.5 text-[10px] font-black text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      {t('confirm')}
                    </button>
                    <button
                      type="button" disabled={busy} onClick={() => setRejectingId(null)}
                      className="rounded-lg border border-(--border) px-2 py-1.5 text-[10px] font-bold text-(--text-secondary)"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              )}

              {item.publishedAt && activeRequest?.status === 'RETURNED' && (
                <div className="mt-2 space-y-1.5">
                  <MediaAssetPicker
                    projectId={projectId}
                    labels={pickerLabels}
                    value={replyAttachments[item.id] || []}
                    onChange={entries => setReplyAttachments(prev => ({ ...prev, [item.id]: entries }))}
                    disabled={busy}
                  />
                  <div className="flex gap-1.5">
                  <input
                    value={replyDrafts[item.id] || ''}
                    onChange={event => setReplyDrafts(prev => ({ ...prev, [item.id]: event.target.value }))}
                    placeholder={t('instructor.review.replyPlaceholder')}
                    disabled={busy}
                    onKeyDown={event => { if (event.key === 'Enter') sendReply(item); }}
                    className="min-w-0 flex-1 rounded-lg border border-(--border) bg-(--surface) px-2 py-1.5 text-xs text-(--text-primary)"
                  />
                  <button
                    type="button" disabled={busy || !(replyDrafts[item.id] || '').trim()} onClick={() => sendReply(item)}
                    className="shrink-0 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-black text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {t('instructor.review.sendReply')}
                  </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

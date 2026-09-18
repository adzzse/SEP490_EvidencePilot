import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MediaAssetPicker from '../../features/MediaAssetPicker.jsx';
import FeedbackCard, { AttachmentThumbs, ReplyList } from './FeedbackCard.jsx';
import { findOverlaps } from '../../../utils/instructor/feedbackOverlap.js';
import { normalizeSource, selectionLines } from '../../../utils/student/feedbackAnchors.js';

export default function FeedbackThreadsTab({ review, selectedSection, projectId, composerFocusToken = 0 }) {
  const { t, i18n } = useTranslation();
  const {
    feedbackItems, activeRequestId, canCreateRoot,
    feedbackDraft, selectedAnchor, editingFeedbackId, updateFeedbackDraft,
    savingFeedback, activeFeedbackId, handleSubmitFeedback,
    handleEditFeedback, handleCancelEdit, handleDeleteFeedback,
    selectFeedback, errorMessage, successMessage,
    isAdjustingPassage, startPassageAdjust, cancelPassageAdjust,
  } = review;
  const [pendingAttachments, setPendingAttachments] = useState({});
  const [busyId] = useState(null);
  // ponytail: explicit adjust mode — incidental editor selections never
  // retarget an edit; only the floating FAB confirmation commits a new
  // passage. The flag lives in the review workflow so EditorPanel's FAB can
  // see it; Escape exits adjust mode, Change passage toggles it.
  useEffect(() => {
    if (!isAdjustingPassage) return undefined;
    const onKey = event => { if (event.key === 'Escape') cancelPassageAdjust(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isAdjustingPassage, cancelPassageAdjust]);
  const composerRef = useRef(null);
  useEffect(() => {
    if (composerFocusToken > 0) composerRef.current?.focus();
  }, [composerFocusToken]);
  // ponytail: picker picks keyed by message so composer/reply drafts never mix.
  const pendingKey = editingFeedbackId || 'new';
  // ponytail: human line target, never raw offsets. Create mode arms
  // automatically (see autoCaptureSelection); edit mode keeps the explicit
  // button so reviewing never clobbers a seeded passage.
  const passageLines = useMemo(() => {
    if (!selectedAnchor || !selectedSection) return null;
    return selectionLines(selectedSection.contentTex || '', selectedAnchor.from, selectedAnchor.to);
  }, [selectedAnchor, selectedSection]);
  const passageLabel = !selectedAnchor || !passageLines
    ? t('instructor.review.wholeSection')
    : passageLines.first === passageLines.last
      ? t('instructor.review.selectionLine', { line: passageLines.first })
      : t('instructor.review.selectionLines', { from: passageLines.first, to: passageLines.last });
  const mediaLabels = useMemo(() => ({
    selectMedia: t('instructor.review.addMedia'),
    title: t('instructor.review.mediaTitle'),
    empty: t('instructor.review.mediaEmpty'),
    done: t('instructor.review.mediaDone'),
  }), [t]);

  const threads = useMemo(() => (feedbackItems || [])
    .filter(item => String(item.requestId) === String(activeRequestId)
      && String(item.sectionId) === String(selectedSection?.id))
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))),
    [feedbackItems, activeRequestId, selectedSection?.id]);

  // ponytail: overlap is valid — warn only, never block. The item under edit
  // is excluded so its own passage is not reported as a duplicate.
  const overlap = useMemo(() => {
    if (!selectedAnchor) return { count: 0, exactDuplicate: false, ids: [] };
    const others = (feedbackItems || []).filter(item => String(item.id) !== String(editingFeedbackId));
    return findOverlaps(selectedAnchor, others, { requestId: activeRequestId, sectionId: selectedSection?.id });
  }, [selectedAnchor, feedbackItems, editingFeedbackId, activeRequestId, selectedSection?.id]);

  const viewFirstOverlap = () => {
    const first = (feedbackItems || []).find(item => String(item.id) === String(overlap.ids[0]));
    if (first) selectFeedback(first);
  };

  const submitThread = async event => {
    event.preventDefault();
    const ids = (pendingAttachments[pendingKey] || []).map(entry => entry.id);
    const ok = await handleSubmitFeedback(event, ids);
    if (ok) setPendingAttachments(prev => ({ ...prev, [pendingKey]: [] }));
  };

  // ponytail: one form, two homes — top composer is create-only, the editing
  // card renders this same form inline. Called as a plain function (not a
  // component) so focus and DOM identity survive re-renders.
  const composerForm = mode => (
    <form onSubmit={submitThread} className="space-y-2 rounded-xl border border-(--border-light) bg-(--surface-secondary)/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {mode === 'edit' && (
          <div data-testid="passage-controls" className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => (isAdjustingPassage ? cancelPassageAdjust() : startPassageAdjust(editingFeedbackId))}
              disabled={savingFeedback}
              aria-pressed={mode === 'edit' && isAdjustingPassage}
              className="rounded-lg bg-teal-600 px-2.5 py-1.5 text-[10px] font-black text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {t('instructor.review.changePassage')}
            </button>
            {selectedAnchor && !isAdjustingPassage && (
              <button
                type="button"
                onClick={() => updateFeedbackDraft({ anchor: null })}
                disabled={savingFeedback}
                className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-[10px] font-black text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {t('instructor.review.removePassage')}
              </button>
            )}
          </div>
        )}
        {!(mode === 'edit' && isAdjustingPassage) ? (
          <span className="text-[10px] font-semibold text-(--text-secondary)">
            {passageLabel}
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-(--text-secondary)">
            {passageLabel} · {t('instructor.review.adjustPassageHint')}
          </span>
        )}
      </div>
      {selectedAnchor && overlap.count > 0 && (
        <p role="note" className="text-[10px] font-semibold text-(--text-secondary)">
          {overlap.exactDuplicate
            ? t('instructor.review.overlapExact')
            : t('instructor.review.overlapNotice', { count: overlap.count })}{' '}
          <button
            type="button"
            onClick={viewFirstOverlap}
            className="font-black text-teal-700 underline hover:text-teal-800 dark:text-teal-300"
          >
            {t('instructor.review.overlapView')}
          </button>
        </p>
      )}
      <textarea
        ref={composerRef}
        value={feedbackDraft}
        onChange={event => updateFeedbackDraft({ content: event.target.value })}
        placeholder={t('instructor.review.composerPlaceholder')}
        rows={3}
        disabled={savingFeedback}
        className="w-full rounded-lg border border-(--border) bg-(--surface) px-2.5 py-2 text-xs text-(--text-primary) focus-visible:ring-2 focus-visible:ring-(--brand)"
      />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-(--text-tertiary)">{t('instructor.review.attachments')}</p>
        <div className="mt-1">
          <MediaAssetPicker
            projectId={projectId}
            labels={mediaLabels}
            value={pendingAttachments[pendingKey] || []}
            onChange={entries => setPendingAttachments(prev => ({ ...prev, [pendingKey]: entries }))}
            disabled={savingFeedback}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={savingFeedback || !feedbackDraft.trim()}
          className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-black text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {savingFeedback ? t('saving') : mode === 'edit' ? t('instructor.review.updateFeedback') : t('instructor.review.saveFeedback')}
        </button>
        {mode === 'edit' && (
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
  );

  return (
    <div className="space-y-3">
      {errorMessage && <p role="alert" className="text-rose-700">{errorMessage}</p>}
      {successMessage && <p role="status" className="text-emerald-700">{successMessage}</p>}

      {canCreateRoot && !editingFeedbackId && composerForm('create')}

      {threads.length === 0 && (
        <p className="py-4 text-center text-[11px] italic text-(--text-tertiary)">
          {selectedSection ? t('instructor.review.threadsEmpty') : t('instructor.review.selectSectionFeedback')}
        </p>
      )}

      <ul className="space-y-2">
        {threads.map(item => {
          const active = String(item.id) === String(activeFeedbackId);
          const busy = busyId === item.id;
          const isEditing = String(editingFeedbackId) === String(item.id);
          return isEditing ? (
            <li
              key={item.id}
              className="rounded-xl border border-teal-600 bg-(--surface) p-3 text-xs ring-1 ring-teal-600"
            >
              {composerForm('edit')}
              <AttachmentThumbs attachments={item.attachments} />
              <ReplyList replies={item.replies} language={i18n.language} />
            </li>
          ) : (
            <FeedbackCard
              key={item.id}
              item={item}
              active={active}
              onSelect={selectFeedback}
              actions={(
                <div className="mt-2 flex flex-wrap gap-1.5">
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
                </div>
              )}
            />
          );
        })}
      </ul>
    </div>
  );
}

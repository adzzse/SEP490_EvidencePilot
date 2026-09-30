import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MediaAssetPicker from '../../features/MediaAssetPicker.jsx';
import FeedbackCard, { AttachmentThumbs, ReplyList } from './FeedbackCard.jsx';
import { normalizeSource, selectionLines } from '../../../utils/student/feedbackAnchors.js';

export default function FeedbackThreadsTab({ review, selectedSection, composerFocusToken = 0 }) {
  const { t, i18n } = useTranslation();
  const {
    feedbackItems, activeRequestId, canCreateRoot,
    feedbackDraft, selectedAnchor, editingFeedbackId, updateFeedbackDraft,
    savingFeedback, activeFeedbackId, handleSubmitFeedback,
    handleEditFeedback, handleCancelEdit, handleDeleteFeedback, handleDetachAttachment, handleResolveThread,
    selectFeedback, errorMessage, successMessage,
    isAdjustingPassage, startPassageAdjust, cancelPassageAdjust,
  } = review;
  const [pendingAttachments, setPendingAttachments] = useState({});
  const [busyId] = useState(null);
  // rationale: explicit adjust mode — incidental editor selections never
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
  // rationale: picker picks keyed by message so composer/reply drafts never mix.
  const pendingKey = editingFeedbackId || 'new';
  // rationale: human line target, never raw offsets. Create mode arms
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
  // rationale: replace-pending-anchor — the card shows the EXACT pending text
  // sliced from the same normalized source the offsets measure, so the
  // instructor verifies "ChatGPT" vs "(generative …)" before confirming.
  // A new highlight mid-edit replaces this pending anchor on confirm; it
  // never spawns a second thread (FAB is suppressed outside adjust mode).
  const pendingPassageText = useMemo(() => {
    if (!selectedAnchor || !selectedSection) return '';
    const source = normalizeSource(selectedSection.contentTex || '');
    if (!Number.isInteger(selectedAnchor.from) || !Number.isInteger(selectedAnchor.to)) return '';
    if (selectedAnchor.from < 0 || selectedAnchor.to > source.length || selectedAnchor.to <= selectedAnchor.from) return '';
    const text = source.slice(selectedAnchor.from, selectedAnchor.to);
    return text.length > 280 ? `${text.slice(0, 280)}…` : text;
  }, [selectedAnchor, selectedSection]);
  // rationale: while adjusting, the quote follows the live cursor selection
  // (pre-confirm preview); otherwise it shows the armed draft anchor.
  const livePassageText = useMemo(() => {
    if (!isAdjustingPassage || !selectedSection) return '';
    const live = review.liveSelection;
    if (!live || !Number.isInteger(live.from) || !Number.isInteger(live.to) || live.to <= live.from) return '';
    const source = normalizeSource(selectedSection.contentTex || '');
    if (live.from < 0 || live.to > source.length) return '';
    const text = source.slice(live.from, live.to);
    return text.length > 280 ? `${text.slice(0, 280)}…` : text;
  }, [isAdjustingPassage, selectedSection, review.liveSelection]);
  const visiblePassageText = (isAdjustingPassage && livePassageText) || pendingPassageText;
  const mediaLabels = useMemo(() => ({
    heading: t('instructor.review.attachments'),
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

  const submitThread = async event => {
    event.preventDefault();
    const ids = (pendingAttachments[pendingKey] || []).map(entry => entry.id);
    const ok = await handleSubmitFeedback(event, ids);
    if (ok) setPendingAttachments(prev => ({ ...prev, [pendingKey]: [] }));
  };

  // rationale: one form, two homes — top composer is create-only, the editing
  // card renders this same form inline. Called as a plain function (not a
  // component) so focus and DOM identity survive re-renders.
  const composerForm = (mode, editingItem = null) => (
    <form onSubmit={submitThread} className="space-y-2 rounded-xl border border-(--border-light) bg-(--surface-secondary)/50 p-3">
      {!(mode === 'create' && (!selectedAnchor || activeFeedbackId)) && (
      <div className="flex items-center justify-between gap-2">
        {!(mode === 'edit' && isAdjustingPassage) ? (
          <span className="text-[10px] font-semibold text-(--text-secondary)">
            {passageLabel}
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-(--text-secondary)">
            {passageLabel} · {t('instructor.review.adjustPassageHint')}
          </span>
        )}
        {mode === 'edit' && (
          <div data-testid="passage-controls" className="shrink-0">
            <button
              type="button"
              onClick={() => (isAdjustingPassage ? cancelPassageAdjust() : startPassageAdjust(editingFeedbackId))}
              disabled={savingFeedback}
              aria-pressed={mode === 'edit' && isAdjustingPassage}
              className="rounded-lg bg-teal-600 px-2.5 py-1.5 text-[10px] font-black text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {t(isAdjustingPassage ? 'instructor.review.confirmEditedFeedback' : 'instructor.review.changePassage')}
            </button>
          </div>
        )}
      </div>
      )}
      {visiblePassageText && (mode !== 'edit' || isAdjustingPassage) && (mode !== 'create' || !activeFeedbackId) && (
        <blockquote className="rounded-lg border-l-2 border-teal-600 bg-(--surface) px-2.5 py-2 text-[11px] italic leading-relaxed text-(--text-primary)">
          “{visiblePassageText}”
        </blockquote>
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
      <div className="mt-1 space-y-1.5">
          <MediaAssetPicker
            paperId={selectedSection?.documentId}
            labels={mediaLabels}
            value={pendingAttachments[pendingKey] || []}
            onChange={entries => setPendingAttachments(prev => ({ ...prev, [pendingKey]: entries }))}
            disabled={savingFeedback}
          />
          {mode === 'edit' && (editingItem?.attachments?.length > 0) && (
            <AttachmentThumbs
              attachments={editingItem.attachments}
              disabled={savingFeedback}
              onRemove={attachment => handleDetachAttachment(attachment.id)}
            />
          )}
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
          <>
            <button
              type="button"
              onClick={handleCancelEdit}
              disabled={savingFeedback}
              className="rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-[11px] font-bold text-(--text-secondary) disabled:opacity-50"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={() => { handleDeleteFeedback(editingFeedbackId); handleCancelEdit(); }}
              disabled={savingFeedback}
              className="rounded-lg border border-rose-200 px-3 py-2 text-[11px] font-bold text-rose-600 disabled:opacity-50"
            >
              {t('delete')}
            </button>
          </>
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
              {composerForm('edit', item)}
              <ReplyList replies={item.replies} language={i18n.language} />
            </li>
          ) : (
            <FeedbackCard
              key={item.id}
              item={item}
              active={active}
              onSelect={selectFeedback}
              actions={((item.canEdit || item.canDelete) && (
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
              )) || null}
            />
          );
        })}
      </ul>
    </div>
  );
}

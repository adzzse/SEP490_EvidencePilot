import { useTranslation } from 'react-i18next';

// rationale: header-drawer body — the AI Suggestion UI moved out of the review
// panel tabs so instructors can read it side-by-side with the editor.
export default function AiSuggestionDrawer({ review }) {
  const { t } = useTranslation();
  const { activeRequest, suggestions, suggestionLoading, suggestionError,
    suggestionRan, activeGuide, requestLocked, handleGenerateSuggestions } = review;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button onClick={handleGenerateSuggestions} disabled={!activeGuide || suggestionLoading || requestLocked || activeRequest?.status !== 'PENDING'}
          className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50">
          {suggestionLoading ? t('instructor.review.generatingSuggestions') : t('instructor.review.generateSuggestions')}
        </button>
        {activeGuide && <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">{activeGuide.sectionType}</span>}
      </div>
      <p className="text-[10px] text-(--text-tertiary) italic">{t('instructor.review.aiGenerationNote')}</p>
      {suggestionError && (
        <p className="text-[10px] font-bold text-rose-600">{suggestionError}</p>
      )}
      {suggestionLoading && (
        <div className="space-y-2" aria-busy="true">
          <div className="h-14 bg-(--surface-secondary) animate-pulse rounded-xl" />
          <div className="h-14 bg-(--surface-secondary) animate-pulse rounded-xl" />
        </div>
      )}
      {suggestionRan && !suggestionLoading && suggestions.length === 0 && (
        <p className="text-[10px] text-(--text-secondary) italic">{t('instructor.review.noSuggestionIssues')}</p>
      )}
      {suggestions.length > 0 && (
        <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {suggestions.map((suggestion, i) => (
            <li key={i} className="border border-(--border-light) rounded-xl p-3 text-xs space-y-1">
              <p className="font-bold text-(--text-primary) leading-relaxed">{suggestion.issue}</p>
              {suggestion.quote && (
                <p className="text-[10px] text-gray-400 italic leading-relaxed">"{suggestion.quote}"</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

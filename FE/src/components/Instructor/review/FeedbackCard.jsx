import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../../../utils/formatters/date.js';

const LOCATION_KEYS = new Set(['ATTACHED', 'MODIFIED', 'DETACHED', 'SECTION', 'UNLOCATED']);

// ponytail: one card for both tabs — FeedbackThreadsTab passes actions,
// History renders it readOnly with none. No duplicate markup.
// No ticket-state presentation: thread/pending/student statuses stay in
// storage for legacy reads but never render as workflow UI.
export default function FeedbackCard({ item, active = false, onSelect, readOnly = false, actions = null }) {
  const { t, i18n } = useTranslation();
  const location = item.anchor?.current?.status || (item.lineReference ? 'UNLOCATED' : 'SECTION');
  const interactive = !readOnly && typeof onSelect === 'function';
  const Header = interactive ? 'button' : 'div';
  const headerProps = interactive
    ? { type: 'button', onClick: () => onSelect(item), className: 'w-full text-left' }
    : { className: 'w-full text-left' };
  return (
    <li
      className={`rounded-xl border bg-(--surface) p-3 text-xs ${active ? 'border-teal-600 ring-1 ring-teal-600' : 'border-(--border-light)'}`}
    >
      <Header {...headerProps}>
        <span className="flex flex-wrap items-center gap-1.5">
          {!item.publishedAt && (
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {t('instructor.review.draftBadge')}
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
      </Header>

      <AttachmentThumbs attachments={item.attachments} />
      <ReplyList replies={item.replies} language={i18n.language} />

      {actions}
    </li>
  );
}

export function AttachmentThumbs({ attachments }) {
  if (!(attachments || []).length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {attachments.map(attachment => (
        <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" title={attachment.mimeType}>
          <img src={attachment.url} alt="" loading="lazy" decoding="async" className="h-14 w-14 rounded-lg border border-(--border) object-cover" />
        </a>
      ))}
    </div>
  );
}

export function ReplyList({ replies, language }) {
  if (!(replies || []).length) return null;
  return (
    <ul className="mt-2 space-y-1.5 border-t border-(--border-light) pt-2">
      {replies.map(reply => (
        <li key={reply.id} className="rounded-lg bg-(--surface-secondary)/70 px-2 py-1.5">
          <p className="text-[9px] font-bold text-(--text-tertiary)">
            {reply.authorName || reply.authorRole} · {formatDateTime(reply.createdAt, language)}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap break-words leading-relaxed text-(--text-primary)">
            {reply.content}
          </p>
        </li>
      ))}
    </ul>
  );
}

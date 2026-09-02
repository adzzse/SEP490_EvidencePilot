import StatusBadge from './StatusBadge';
import DeleteConfirm from './DeleteConfirm.jsx';

export default function EntityCard({ title, subtitle, status, onClick, onEdit, onDelete, editLabel = 'Edit', deleteLabel = 'Delete', deleteConfirmMessage, deleteCancelLabel = 'Cancel', deleteDisabled, children }) {
  return (
    <div
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        onClick();
      }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`bg-(--surface) border border-(--border) rounded-2xl p-5 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-(--text-primary) truncate group-hover:text-(--brand-foreground) transition-colors">
            {title}
          </p>
          {subtitle && <p className="text-xs text-(--text-secondary) mt-1 line-clamp-2">{subtitle}</p>}
        </div>
        {status && <StatusBadge status={status} className="shrink-0" />}
      </div>
      {children && <div className="mt-3 text-xs text-(--text-secondary)">{children}</div>}
      <div className="flex gap-3 mt-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
        {onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="text-xs text-(--brand-foreground) hover:underline font-semibold"
          >
            {editLabel}
          </button>
        )}
        {onDelete && (
          <DeleteConfirm
            message={deleteConfirmMessage}
            onConfirm={onDelete}
            triggerLabel={deleteLabel}
            confirmLabel={deleteLabel}
            cancelLabel={deleteCancelLabel}
            disabled={deleteDisabled}
            className="text-xs text-rose-600 hover:underline font-semibold"
          >
            {deleteLabel}
          </DeleteConfirm>
        )}
      </div>
    </div>
  );
}

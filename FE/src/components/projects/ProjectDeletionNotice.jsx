import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

function remainingValue(milliseconds, t) {
  if (milliseconds >= DAY_MS) {
    return t('projectDeletion.remainingDays', { count: Math.ceil(milliseconds / DAY_MS) });
  }
  if (milliseconds >= HOUR_MS) {
    return t('projectDeletion.remainingHours', { count: Math.ceil(milliseconds / HOUR_MS) });
  }
  return t('projectDeletion.remainingMinutes', {
    count: Math.max(1, Math.ceil(milliseconds / MINUTE_MS)),
  });
}

export default function ProjectDeletionNotice({ deadline, canRevoke = false, onRevoke }) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => clearInterval(id);
  }, []);
  const deadlineDate = new Date(deadline);
  if (Number.isNaN(deadlineDate.getTime())) return null;
  const remaining = Math.max(0, deadlineDate.getTime() - now);
  const formattedDeadline = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(deadlineDate);
  return (
    <aside role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
      <p className="font-bold">{t('projectDeletion.readOnlyNotice', { deadline: formattedDeadline })}</p>
      <p className="mt-1 text-sm">
        {remaining > 0 ? remainingValue(remaining, t) : t('projectDeletion.awaitingPurge')}
      </p>
      {canRevoke && (
        <button type="button" onClick={onRevoke} className="mt-3 rounded-lg border border-amber-500 px-3 py-1.5 text-sm font-bold hover:bg-amber-100 transition-colors cursor-pointer">
          {t('instructor.projectManagement.revokeDeletion')}
        </button>
      )}
    </aside>
  );
}

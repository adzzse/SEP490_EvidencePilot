import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateTime, toDate } from '../../utils/formatters/date.js';

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

export default function ProjectDeletionNotice({ deadline }) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => clearInterval(id);
  }, []);
  const deadlineDate = toDate(deadline);
  if (Number.isNaN(deadlineDate.getTime())) return null;
  const remaining = Math.max(0, deadlineDate.getTime() - now);
  const formattedDeadline = formatDateTime(deadline, i18n.language);
  return (
    <aside role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
      <p className="text-xs font-bold">{t('projectDeletion.readOnlyNotice', { deadline: formattedDeadline })}</p>
      <p className="mt-0.5 text-[11px]">
        {remaining > 0 ? remainingValue(remaining, t) : t('projectDeletion.awaitingPurge')}
      </p>
    </aside>
  );
}

export default function UserDetailCard({ user }) {
  if (!user) return null;
  // ponytail: prop-driven, falls back to spec example values so the card renders standalone
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || 'Test Student';
  const initials =
    `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() ||
    fullName?.[0]?.toUpperCase() ||
    '?';
  const role = user.role || 'STUDENT';
  const status = user.accountStatus || user.status || 'ACTIVE';
  const systemDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString()
    : new Date().toLocaleDateString();
  const rows = [
    ['ID', user.id ?? 'dbaosni'],
    ['Name', fullName],
    ['Student Code', user.studentCode || '—'],
    ['Email', user.email || 'student@evidencepilot.dev'],
    ['Role', role.charAt(0) + role.slice(1).toLowerCase()],
    ['Status', status.charAt(0) + status.slice(1).toLowerCase()],
    ['System Date', systemDate],
  ];

  return (
    <div className="text-left">
      <div className="flex items-center gap-4 text-left">
        <div className="w-12 h-12 rounded-full overflow-hidden bg-(--brand-soft) text-(--brand-foreground) flex items-center justify-center text-sm font-black shrink-0" aria-hidden="true">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <div className="text-left">
          <h3 className="text-lg font-bold text-(--text-primary) leading-tight">{fullName}</h3>
          <p className="text-xs text-(--text-secondary) font-semibold mt-0.5">{`${role} • ${status}`}</p>
        </div>
      </div>
      <dl className="mt-6 grid grid-cols-[130px_1fr] gap-x-4 gap-y-2.5 text-left">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-xs font-bold text-(--text-secondary)">{k}</dt>
            <dd className="text-sm text-(--text-primary) min-w-0 break-all">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

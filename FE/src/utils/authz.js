const errorCode = error => error?.response?.data?.code;

export function isAccountRevokedError(error) {
  return error?.response?.status === 403 && errorCode(error) === 'ACCOUNT_BANNED';
}

export function isProjectMembershipDenied(error) {
  return error?.response?.status === 403 && errorCode(error) === 'PROJECT_MEMBERSHIP_REQUIRED';
}

// Role gate for activity navigation: an activity row must never leave the
// viewer's own role pages, even if the API ever returns a cross-role link.
// Recent-place shortcuts are NOT gated here — those destinations were
// access-checked server-side when recorded.
const ROLE_LINK_PREFIX = {
  ADMIN: '/admin/',
  INSTRUCTOR: '/instructor/',
  STUDENT: '/student/',
};

export function isLinkAllowedForRole(link, role) {
  const prefix = ROLE_LINK_PREFIX[role];
  if (!prefix || typeof link !== 'string') return false;
  return link.startsWith(prefix);
}

// P0b: best-effort self-revocation notice. A USER STATUS_CHANGED broadcast for
// the signed-in user means an admin touched my account — re-verify the session
// and let the global 401/403 flow log me out if access is gone. Null/other ids
// are never treated as self events.
export function isSelfAccountChangeEvent(evt, userId) {
  return !!evt && evt.entity === 'USER' && evt.action === 'STATUS_CHANGED'
    && userId != null && evt.id != null && String(evt.id) === String(userId);
}

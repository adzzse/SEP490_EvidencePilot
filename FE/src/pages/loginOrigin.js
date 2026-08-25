const defaultWorkspace = {
  ADMIN: '/admin/dashboard',
  INSTRUCTOR: '/instructor/dashboard',
  STUDENT: '/student/projects',
};

const privateRoutes = [
  { roles: ['STUDENT', 'INSTRUCTOR', 'ADMIN'], pattern: /^\/profile\/?$/ },
  { roles: ['INSTRUCTOR', 'ADMIN'], pattern: /^\/instructor\/profile\/?$/ },
  { roles: ['INSTRUCTOR', 'ADMIN'], pattern: /^\/instructor\/dashboard\/?$/ },
  { roles: ['INSTRUCTOR', 'ADMIN'], pattern: /^\/instructor\/projects(?:\/[^/]+)?\/?$/ },
  { roles: ['INSTRUCTOR', 'ADMIN'], pattern: /^\/instructor\/requests(?:\/[^/]+)?\/?$/ },
  { roles: ['INSTRUCTOR', 'ADMIN'], pattern: /^\/instructor\/collections(?:\/[^/]+)?\/?$/ },
  { roles: ['ADMIN'], pattern: /^\/admin\/(?:dashboard|profile)\/?$/ },
  { roles: ['STUDENT'], pattern: /^\/student\/projects(?:\/[^/]+)?\/?$/ },
];

export function rememberLoginOrigin(pathname, search = '', storage = globalThis.sessionStorage) {
  if (typeof pathname !== 'string' || pathname.startsWith('/login')) return;
  try {
    storage?.setItem('login_origin', pathname + (typeof search === 'string' ? search : ''));
  } catch {
    // Storage can be unavailable in private browsing; login must still continue.
  }
}

export function getPostLoginDestination(origin, role, baseOrigin) {
  const fallback = defaultWorkspace[role] || defaultWorkspace.STUDENT;
  if (typeof origin !== 'string' || !origin.startsWith('/') || origin.startsWith('//')) return fallback;

  try {
    const url = new URL(origin, baseOrigin);
    if (url.origin !== baseOrigin) return fallback;
    return privateRoutes.some(route => route.roles.includes(role) && route.pattern.test(url.pathname))
      ? `${url.pathname}${url.search}${url.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .trim();
}

export function studentDisplayName(student) {
  return [student?.firstName, student?.lastName].filter(Boolean).join(' ')
    || student?.email
    || (student?.userId != null ? String(student.userId).slice(0, 8) : '')
    || (student?.id != null ? String(student.id).slice(0, 8) : '')
    || 'Unassigned';
}

export const SUGGESTION_PAGE_SIZE = 8;

export function paginateStudents(list, page, pageSize = SUGGESTION_PAGE_SIZE) {
  const items = Array.isArray(list) ? list : [];
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  return {
    items: items.slice(safePage * pageSize, safePage * pageSize + pageSize),
    page: safePage,
    totalPages,
    total: items.length,
  };
}

export function getStudentSuggestions(users, projectMembers, query, limit = 8) {
  const memberIds = new Set((Array.isArray(projectMembers) ? projectMembers : [])
    .map(member => String(member?.userId)));
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);

  return (Array.isArray(users) ? users : [])
    .filter(student => student?.id != null
      && student.role === 'STUDENT'
      && !memberIds.has(String(student.id)))
    .filter(student => {
      const searchable = normalizeSearch(`${studentDisplayName(student)} ${student.studentCode || ''}`);
      return terms.every(term => searchable.includes(term));
    })
    .slice(0, limit);
}

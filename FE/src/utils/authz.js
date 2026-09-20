function errorMessage(error) {
  return String(error?.response?.data?.message || error?.response?.data?.detail || '');
}

export function isAccountRevokedError(error) {
  return error?.response?.status === 403 && /account is not active/i.test(errorMessage(error));
}

export function isProjectMembershipDenied(error) {
  return error?.response?.status === 403
    && /(?:project access denied|write access denied to project)/i.test(errorMessage(error));
}

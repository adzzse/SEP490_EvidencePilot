const errorCode = error => error?.response?.data?.code;

export function isAccountRevokedError(error) {
  return error?.response?.status === 403 && errorCode(error) === 'ACCOUNT_BANNED';
}

export function isProjectMembershipDenied(error) {
  return error?.response?.status === 403 && errorCode(error) === 'PROJECT_MEMBERSHIP_REQUIRED';
}

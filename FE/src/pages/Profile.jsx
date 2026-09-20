import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
// rationale: crop UI (~60KB) loads only when the avatar modal opens.
const ReactCrop = lazy(() => Promise.all([
  import('react-image-crop'),
  import('react-image-crop/dist/ReactCrop.css'),
]).then(([mod]) => mod));
import api from '../services/api.js';
import { AppHeader, LoadingSkeleton, Breadcrumb, Modal } from '../components';
import OtpInput from '../components/ui/OtpInput.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { formatDateTime } from '../utils/formatters/date';

function formatActivityTime(value, language) {
  if (!value) return '';
  try {
    return formatDateTime(value, language);
  } catch {
    return '';
  }
}

// rationale: student rows always land on the project root — no /sections/... suffix.
function studentProjectLink(item) {
  if (item?.projectId) return `/student/projects/${item.projectId}`;
  const m = typeof item?.link === 'string' ? item.link.match(/^\/student\/projects\/[^/]+/) : null;
  if (m) return m[0];
  return item?.link || '/student/projects';
}

// rationale: single call-site polymorphic row — role + type decide the template.
// Instructor: collection / project / source. Student: project root only.
function ActivityLogItem({ item, role, language, translate }) {
  if (!item) return null;
  const ts = formatActivityTime(item.occurredAt, language);
  const rowClass =
    'block p-3 rounded-xl border border-(--border-light) bg-(--surface-secondary)/50 hover:bg-(--surface-secondary) hover:border-(--brand)/40 transition-colors';
  const titleClass = 'text-xs font-bold text-(--text-primary) truncate';
  const metaClass = 'text-[10px] text-(--text-tertiary) mt-0.5';
  const tsClass = 'text-[10px] font-mono text-(--text-tertiary) shrink-0';

  const isInstructor = role === 'INSTRUCTOR';
  const isStudent = role === 'STUDENT';

  // Instructor — Collection: [CollectionName] [Total Sources] [Timestamp]
  if (item.type === 'collection' && isInstructor) {
    const sources = item.totalSources ?? 0;
    return (
      <Link
        key={`collection-${item.entityId || item.title}-${item.occurredAt}`}
        to={item.link || '/instructor/source-library'}
        className={rowClass}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={titleClass}>{item.title}</p>
            <p className={metaClass}>{translate('profile.activity.sourceCount', { count: sources })}</p>
          </div>
          <span className={tsClass}>{ts}</span>
        </div>
      </Link>
    );
  }

  // Instructor — Project: [ProjectName] [Total members] [Timestamp]
  if (item.type === 'project' && isInstructor) {
    const members = item.totalMembers ?? 0;
    return (
      <Link
        key={`project-${item.entityId || item.title}-${item.occurredAt}`}
        to={item.link}
        className={rowClass}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={titleClass}>{item.title}</p>
            <p className={metaClass}>{translate('profile.activity.memberCount', { count: members })}</p>
          </div>
          <span className={tsClass}>{ts}</span>
        </div>
      </Link>
    );
  }

  // Instructor — Source: [SourceName] [Status] [Timestamp]
  if (item.type === 'source' && isInstructor) {
    return (
      <Link
        key={`source-${item.entityId || item.title}-${item.occurredAt}`}
        to={item.link || '/instructor/source-library'}
        className={rowClass}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={titleClass}>{item.title}</p>
            <p className={metaClass}>{item.status || ''}</p>
          </div>
          <span className={tsClass}>{ts}</span>
        </div>
      </Link>
    );
  }

  // Student — Workspace: [Project Name] [Section Name] [Timestamp]
  // rationale: link targets the project root only, never /sections/...
  if (item.type === 'project-section' && isStudent) {
    return (
      <Link
        key={`project-section-${item.entityId || item.title}-${item.occurredAt}`}
        to={studentProjectLink(item)}
        className={rowClass}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={titleClass}>{item.title}</p>
            <p className={metaClass}>{item.subtitle || ''}</p>
          </div>
          <span className={tsClass}>{ts}</span>
        </div>
      </Link>
    );
  }

  // Student generic project row (e.g. PROJECT_CREATED by the student):
  // render as workspace root without a section name.
  if (item.type === 'project' && isStudent) {
    return (
      <Link
        key={`project-${item.entityId || item.title}-${item.occurredAt}`}
        to={studentProjectLink(item)}
        className={rowClass}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={titleClass}>{item.title}</p>
            <p className={metaClass}>{item.subtitle || ''}</p>
          </div>
          <span className={tsClass}>{ts}</span>
        </div>
      </Link>
    );
  }

  return null;
}

export function ProfileContent({ embedded = false }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: authUser, role, logout, verifySession } = useAuth();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [user, setUser] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [pendingEmail, setPendingEmail] = useState(null);
  const [emailActionLoading, setEmailActionLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [showPasswordConfirmModal, setShowPasswordConfirmModal] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  // OTP email verification
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpCooldownUntil, setOtpCooldownUntil] = useState(null);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpRequesting, setOtpRequesting] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState('');
  // The email that the user has successfully verified. Until they change it again,
  // they can save without re-verifying. Saved as a one-shot claim token from the BE.
  const [verifiedClaim, setVerifiedClaim] = useState(null);
  const [verifiedEmail, setVerifiedEmail] = useState(null);
  const otpFieldRef = useRef(null);

  // Avatar upload + crop
  const [avatarSrc, setAvatarSrc] = useState(null);
  const [avatarCrop, setAvatarCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const avatarFileRef = useRef(null);
  const avatarImgRef = useRef(null);

  const openAvatarPicker = () => {
    setAvatarError('');
    avatarFileRef.current?.click();
  };

  const handleAvatarFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAvatarError(t('profile.avatar.errors.imageOnly'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError(t('profile.avatar.errors.maxSize'));
      return;
    }
    setAvatarSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setAvatarCrop(undefined);
    setCompletedCrop(null);
  };

  const handleAvatarCropComplete = async () => {
    const image = avatarImgRef.current;
    if (!image || !completedCrop?.width || !completedCrop?.height) {
      setAvatarError(t('profile.avatar.errors.cropRequired'));
      return;
    }
    setAvatarUploading(true);
    setAvatarError('');
    try {
      // rationale: react-image-crop may hand back percent or pixel crops
      // depending on version — normalize to natural pixels either way.
      const toPixels = (c) => {
        if (!c || !c.width || !c.height) return null;
        if (c.unit === '%') {
          return {
            x: (c.x / 100) * image.naturalWidth,
            y: (c.y / 100) * image.naturalHeight,
            width: (c.width / 100) * image.naturalWidth,
            height: (c.height / 100) * image.naturalHeight,
          };
        }
        const scaleX = image.naturalWidth / image.width;
        const scaleY = image.naturalHeight / image.height;
        return { x: c.x * scaleX, y: c.y * scaleY, width: c.width * scaleX, height: c.height * scaleY };
      };
      const px = toPixels(completedCrop);
      if (!px) {
        setAvatarError(t('profile.avatar.errors.cropRequired'));
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(px.width);
      canvas.height = Math.round(px.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, px.x, px.y, px.width, px.height, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('crop-failed');
      const form = new FormData();
      form.append('file', blob, 'avatar.jpg');
      const { data } = await api.post('/api/users/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (data?.avatarUrl) setUser((prev) => (prev ? { ...prev, avatarUrl: data.avatarUrl } : prev));
      verifySession().catch(() => { });
      setAvatarSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setMessage({
        type: 'success',
        text: t('profile.avatar.updated'),
      });
    } catch {
      setAvatarError(t('profile.avatar.uploadFailed'));
    } finally {
      setAvatarUploading(false);
    }
  };

  // Recent activity feed
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [activityQuery, setActivityQuery] = useState('');
  const [activitySort, setActivitySort] = useState('latest');
  const [activityPage, setActivityPage] = useState(1);
  const ACTIVITY_PAGE_SIZE = 4;

  // Tab State with deep-linking
  const currentTab = searchParams.get('tab') === 'activity' ? 'activity' : 'account';
  const setTab = (tab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'activity') next.set('tab', 'activity');
    else next.delete('tab');
    setSearchParams(next);
  };

  useEffect(() => {
    if (!authUser) return;
    setUser(authUser);
    setFirstName(authUser.firstName || '');
    setLastName(authUser.lastName || '');
    setEmail(authUser.email || '');
    setPendingEmail(authUser.pendingEmail || null);
  }, [authUser]);

  // Handle email verification token from URL
  useEffect(() => {
    const verifyToken = searchParams.get('verifyEmailToken');
    if (verifyToken) {
      api.post('/api/users/email-change/confirm', { token: verifyToken })
        .then((res) => {
          setMessage({
            type: 'success',
            text: res.data?.message || t('profile.email.confirmed')
          });
          setPendingEmail(null);
          verifySession().catch(() => { });
          const next = new URLSearchParams(searchParams);
          next.delete('verifyEmailToken');
          setSearchParams(next);
        })
        .catch((err) => {
          setMessage({
            type: 'error',
            text: err.response?.data?.message || t('profile.email.invalidToken')
          });
        });
    }
  }, [searchParams, setSearchParams, language, verifySession]);

  // Fetch recent activity when the activity tab is active
  useEffect(() => {
    if (currentTab !== 'activity') return;
    setActivityLoading(true);
    setActivityError('');
    api.get('/api/users/me/activity', { params: { limit: 20 } })
      .then((res) => setActivity(res.data?.items || []))
      .catch((err) => setActivityError(err.response?.data?.message || t('profile.activity.loadFailed')))
      .finally(() => setActivityLoading(false));
  }, [currentTab, language]);

  // rationale: client-side search + sort + 4-per-page over the fetched feed.
  const visibleActivity = useMemo(() => {
    const q = activityQuery.trim().toLowerCase();
    const filtered = q
      ? activity.filter((item) =>
        [item.title, item.subtitle, item.status, item.type]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
      : [...activity];
    filtered.sort((a, b) => {
      const ta = a?.occurredAt ? new Date(a.occurredAt).getTime() : 0;
      const tb = b?.occurredAt ? new Date(b.occurredAt).getTime() : 0;
      return activitySort === 'oldest' ? ta - tb : tb - ta;
    });
    return filtered;
  }, [activity, activityQuery, activitySort]);

  const totalActivityPages = Math.max(1, Math.ceil(visibleActivity.length / ACTIVITY_PAGE_SIZE));
  const safeActivityPage = Math.min(Math.max(1, activityPage), totalActivityPages);
  const pagedActivity = visibleActivity.slice(
    (safeActivityPage - 1) * ACTIVITY_PAGE_SIZE,
    safeActivityPage * ACTIVITY_PAGE_SIZE,
  );

  // OTP 1-second countdown
  useEffect(() => {
    if (!otpCooldownUntil) {
      setOtpCountdown(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((new Date(otpCooldownUntil).getTime() - Date.now()) / 1000));
      setOtpCountdown(remaining);
      if (remaining <= 0) setOtpCooldownUntil(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [otpCooldownUntil]);

  const closeOtpModal = () => {
    setOtpModalOpen(false);
    setOtpError('');
    otpFieldRef.current?.clear();
  };

  const handleRequestOtp = async () => {
    if (!EMAIL_REGEX.test(email.trim())) {
      setMessage({
        type: 'error',
        text: t('profile.validation.emailInvalid'),
      });
      return;
    }
    setOtpRequesting(true);
    setOtpError('');
    try {
      const res = await api.post('/api/users/email/otp/request', { email: email.trim() });
      setOtpCooldownUntil(res.data?.cooldownUntil || null);
      otpFieldRef.current?.clear();
      setOtpModalOpen(true);
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      if (status === 429) {
        // rationale: server tells us when the next OTP is allowed. Mirror the cooldown
        // for the FE timer so the resend button reflects the real wait time.
        setOtpCooldownUntil(new Date(Date.now() + 60_000).toISOString());
      }
      setMessage({
        type: 'error',
        text: msg || t('profile.email.otp.requestFailed'),
      });
    } finally {
      setOtpRequesting(false);
    }
  };

  const handleVerifyOtp = async (code) => {
    if (!code || code.length !== 6) {
      setOtpError(t('profile.email.otp.incomplete'));
      return;
    }
    setOtpVerifying(true);
    setOtpError('');
    try {
      const res = await api.post('/api/users/email/otp/verify', { email: email.trim(), code });
      setVerifiedClaim(res.data?.claimToken || null);
      setVerifiedEmail(email.trim());
      setMessage({
        type: 'success',
        text: t('profile.email.otp.verifiedToSave'),
      });
      closeOtpModal();
    } catch (err) {
      const msg = err.response?.data?.message || t('profile.email.otp.invalidCode');
      setOtpError(msg);
      // Clear all digits so the user can immediately type a fresh code.
      otpFieldRef.current?.clear();
    } finally {
      setOtpVerifying(false);
    }
  };

  // If the user changes the email field again, the previous claim is no longer valid.
  useEffect(() => {
    if (verifiedEmail && email.trim() !== verifiedEmail) {
      setVerifiedClaim(null);
      setVerifiedEmail(null);
    }
  }, [email, verifiedEmail]);

  const handleRequestEmailChange = async (targetEmail) => {
    const toVerify = (targetEmail || email).trim();
    if (!toVerify || toVerify === user.email) return;
    setEmailActionLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await api.post('/api/users/email-change/request', { newEmail: toVerify });
      setPendingEmail(res.data.pendingEmail || toVerify);
      setMessage({
        type: 'success',
        text: res.data.message || t('profile.email.change.requested')
      });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || t('profile.email.change.requestFailed')
      });
    } finally {
      setEmailActionLoading(false);
    }
  };

  const handleCancelEmailChange = async () => {
    setEmailActionLoading(true);
    setMessage({ type: '', text: '' });
    try {
      await api.delete('/api/users/email-change/cancel');
      setPendingEmail(null);
      setEmail(user.email || '');
      setMessage({
        type: 'success',
        text: t('profile.email.change.cancelled')
      });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || t('profile.email.change.cancelFailed')
      });
    } finally {
      setEmailActionLoading(false);
    }
  };

  const handleResetForm = () => {
    if (!user) return;
    setFirstName(user.firstName || '');
    setLastName(user.lastName || '');
    setEmail(user.email || '');
    setPasswordForm({ currentPassword: '', newPassword: '' });
    setMessage({ type: '', text: '' });
    setEditMode(false);
    setVerifiedClaim(null);
    setVerifiedEmail(null);
    closeOtpModal();
  };

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setMessage({ type: 'error', text: t('profile.validation.nameRequired') });
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setMessage({
        type: 'error',
        text: t('profile.validation.emailInvalid'),
      });
      return;
    }

    const currentPwd = (passwordForm.currentPassword || '').trim();
    const newPwd = (passwordForm.newPassword || '').trim();
    const hasPasswordInput = Boolean(currentPwd || newPwd);
    const emailChanged = email.trim() !== (user.email || '');

    // Password change requires a new password. Email-only changes do NOT require the current password.
    if (hasPasswordInput && !newPwd) {
      setMessage({
        type: 'error',
        text: t('profile.validation.newPasswordRequired'),
      });
      return;
    }
    if (newPwd && !currentPwd) {
      setMessage({
        type: 'error',
        text: t('profile.validation.currentPasswordRequired'),
      });
      return;
    }

    if (newPwd) {
      setShowPasswordConfirmModal(true);
      return;
    }

    // Email change requires a verified claim token.
    if (emailChanged && !verifiedClaim) {
      setMessage({
        type: 'error',
        text: t('profile.validation.emailVerificationRequired'),
      });
      return;
    }

    setSubmitting(true);
    setMessage({ type: '', text: '' });

    try {
      const nameChanged = firstName.trim() !== (user.firstName || '') || lastName.trim() !== (user.lastName || '');
      const payload = {};
      if (nameChanged) {
        payload.firstName = firstName.trim();
        payload.lastName = lastName.trim();
      }
      if (emailChanged) {
        payload.email = email.trim();
      }

      const headers = {};
      if (emailChanged) headers['X-Email-Otp-Claim'] = verifiedClaim;

      const { data } = await api.put('/api/users/profile', payload, { headers });
      setUser(data);
      verifySession().catch(() => { });
      setVerifiedClaim(null);
      setVerifiedEmail(null);
      setMessage({
        type: 'success',
        text: t('profile.updated'),
      });
      setEditMode(false);
    } catch (error) {
      const status = error.response?.status;
      const fallback = status === 403
        ? t('profile.updateClaimInvalid')
        : t('profile.updateFailed');
      setMessage({ type: 'error', text: error.response?.data?.message || fallback });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmPasswordUpdate = async () => {
    setPasswordSubmitting(true);
    setMessage({ type: '', text: '' });

    try {
      // First save profile names if modified
      if (firstName.trim() !== (user.firstName || '') || lastName.trim() !== (user.lastName || '')) {
        await api.put('/api/users/profile', {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        });
      }

      await api.post('/api/auth/update-password', {
        currentPassword: passwordForm.currentPassword.trim(),
        newPassword: passwordForm.newPassword.trim(),
      });

      setShowPasswordConfirmModal(false);
      sessionStorage.setItem('auth_expired_notice', t('profile.password.changedSignIn'));
      logout();
      navigate('/login', { replace: true });
    } catch (error) {
      setShowPasswordConfirmModal(false);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || t('profile.password.updateFailed'),
      });
    } finally {
      setPasswordSubmitting(false);
    }
  };

  if (!user) {
    return embedded ? (
      <div className="p-2"><LoadingSkeleton count={4} /></div>
    ) : (
      <div className="min-h-screen bg-(--page-bg)">
        <AppHeader />
        <div className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8"><LoadingSkeleton count={4} /></div>
      </div>
    );
  }

  const roleLabel = {
    ADMIN: t('shell.profile.roles.ADMIN'),
    INSTRUCTOR: t('shell.profile.roles.INSTRUCTOR'),
    STUDENT: t('shell.profile.roles.STUDENT'),
  }[user.role] || user.role;
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'U';

  return (
    <div className={embedded ? '' : 'min-h-screen overflow-x-hidden bg-(--page-bg) text-(--text-primary) font-sans'}>
      {!embedded && <AppHeader />}
      <main className={embedded ? '' : 'mx-auto max-w-4xl p-4 sm:p-6 lg:p-8'}>

        {!embedded && (
          <Breadcrumb
            items={[
              { label: role === 'INSTRUCTOR' ? t('shell.navigation.dashboard') : (role === 'ADMIN' ? t('shell.profile.roles.ADMIN') : t('shell.navigation.projects')), path: role === 'INSTRUCTOR' ? '/instructor/dashboard' : (role === 'ADMIN' ? '/admin/dashboard' : '/student/projects') },
              { label: t('shell.profile.label') }
            ]}
          />
        )}

        {/* Profile Header Flexbox (Left: Avatar & Identity, Right: Tabs) */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-start w-full gap-4 mb-6 border-b border-(--border) pb-6">
          {/* Avatar & Identity Info */}
          <div className="flex items-center gap-3.5 min-w-0">
            <button
              type="button"
              onClick={openAvatarPicker}
              title={t('profile.avatar.change')}
              aria-label={t('profile.avatar.change')}
              className="relative w-14 h-14 rounded-2xl overflow-hidden bg-(--brand-soft) text-(--brand-foreground) font-black text-lg flex items-center justify-center border border-(--brand)/20 shadow-xs shrink-0 cursor-pointer group"
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                initials
              )}
              <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/40 text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </span>
            </button>
            <input
              ref={avatarFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { handleAvatarFile(e.target.files?.[0] || null); e.target.value = ''; }}
            />
            <div className="min-w-0">
              <h1 className="text-xl font-black text-(--brand-foreground) truncate">
                {user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : user.email}
                {user.role === 'STUDENT' && user.studentCode && (
                  <span className="ml-2 font-mono text-sm font-bold text-(--text-secondary)">[{user.studentCode}]</span>
                )}
              </h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-(--brand-soft) text-(--brand-foreground) border border-(--brand)/20 shrink-0">
                  {roleLabel}
                </span>
                <span className="text-xs text-(--text-tertiary) truncate">{user.email}</span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div role="tablist" aria-label={t('profile.tabs.label')} className="inline-flex w-full md:w-auto rounded-xl border border-(--border) bg-(--surface-secondary) p-1 shrink-0">
            <button
              type="button"
              role="tab"
              aria-selected={currentTab === 'account'}
              onClick={() => setTab('account')}
              className={`flex-1 md:flex-none cursor-pointer rounded-lg px-4 sm:px-5 py-2 text-xs font-bold transition-all ${currentTab === 'account' ? 'bg-(--surface) text-(--brand-foreground) shadow-xs' : 'text-(--text-tertiary) hover:text-(--text-primary)'}`}
            >
              {t('shell.profile.accountSettings')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={currentTab === 'activity'}
              onClick={() => setTab('activity')}
              className={`flex-1 md:flex-none cursor-pointer rounded-lg px-4 sm:px-5 py-2 text-xs font-bold transition-all ${currentTab === 'activity' ? 'bg-(--surface) text-(--brand-foreground) shadow-xs' : 'text-(--text-tertiary) hover:text-(--text-primary)'}`}
            >
              {t('shell.profile.myActivity')}
            </button>
          </div>
        </div>

        {/* Tab 1: Account Settings */}
        {currentTab === 'account' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-(--border) bg-(--surface) p-6 sm:p-8 shadow-xs">
              <div className="mb-6 border-b border-(--border-light) pb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-(--text-primary)">
                    {t('profile.account.title')}
                  </h2>
                  <p className="text-xs text-(--text-secondary) mt-0.5">
                    {t('profile.account.description')}
                  </p>
                </div>
                {!editMode && (
                  <button
                    type="button"
                    onClick={() => { setMessage({ type: '', text: '' }); setEditMode(true); }}
                    className="shrink-0 px-4 py-2 rounded-xl bg-(--brand) text-(--on-brand) font-bold text-xs shadow-xs hover:bg-(--brand-hover) transition-colors cursor-pointer"
                  >
                    {t('profile.actions.edit')}
                  </button>
                )}
              </div>

              {message.text && (
                <div className={`mb-6 p-4 rounded-xl text-xs font-bold border ${message.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                  {message.text}
                </div>
              )}

              {/* Pending Email Verification Banner */}
              {pendingEmail && (
                <div className="mb-6 p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-900 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    <div>
                      <p className="text-xs font-bold">{t('profile.email.pending.title')}</p>
                      <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                        {t('profile.email.pending.description', { pendingEmail, currentEmail: user.email })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRequestEmailChange(pendingEmail)}
                      disabled={emailActionLoading}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {t('profile.actions.resend')}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEmailChange}
                      disabled={emailActionLoading}
                      className="px-3 py-1.5 bg-white dark:bg-amber-900 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 text-amber-900 dark:text-amber-100 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* 1. Personal Information Inputs */}
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-bold text-(--text-secondary) mb-1.5">{t('profile.fields.firstName')} <span className="text-rose-500">*</span></label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        required
                        readOnly={!editMode}
                        className={`w-full rounded-xl border border-(--border) bg-(--surface-secondary) px-4 py-2.5 text-xs font-medium text-(--text-primary) outline-none focus:ring-2 focus:ring-(--focus) ${!editMode ? 'cursor-default opacity-90' : ''}`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-(--text-secondary) mb-1.5">{t('profile.fields.lastName')} <span className="text-rose-500">*</span></label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        required
                        readOnly={!editMode}
                        className={`w-full rounded-xl border border-(--border) bg-(--surface-secondary) px-4 py-2.5 text-xs font-medium text-(--text-primary) outline-none focus:ring-2 focus:ring-(--focus) ${!editMode ? 'cursor-default opacity-90' : ''}`}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-(--text-secondary) mb-1.5">{t('profile.fields.email')} <span className="text-rose-500">*</span></label>
                      <div className="relative">
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          readOnly={!editMode}
                          className={`w-full rounded-xl border border-(--border) bg-(--surface-secondary) px-4 py-2.5 text-xs font-medium text-(--text-primary) outline-none focus:ring-2 focus:ring-(--focus) ${!editMode ? 'cursor-default opacity-90' : ''}`}
                        />
                        {editMode && email && email !== user.email && (
                          <button
                            type="button"
                            onClick={handleRequestOtp}
                            disabled={otpRequesting}
                            className="absolute inset-y-1.5 right-1.5 px-2.5 rounded-lg bg-(--brand) text-(--on-brand) text-[10px] font-black hover:bg-(--brand-hover) transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {otpRequesting
                              ? t('profile.email.otp.sending')
                              : (verifiedEmail === email.trim()
                                ? t('profile.email.otp.verified')
                                : t('profile.email.otp.verify'))}
                          </button>
                        )}
                        {email && email === user.email && !pendingEmail && (
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-emerald-500" title={t('profile.email.verifiedTitle')}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-(--text-tertiary) mt-1">
                        {t('profile.email.changeHint')}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-(--text-secondary) mb-1.5">{t('profile.fields.assignedRole')}</label>
                      <input
                        type="text"
                        value={roleLabel}
                        disabled
                        className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) px-4 py-2.5 text-xs font-medium text-(--text-tertiary) cursor-not-allowed opacity-75"
                      />
                    </div>
                  </div>

                  {/* Password Modification Fields */}
                  <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-(--border-light)">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-(--text-secondary)">
                        {t('profile.fields.currentPassword')}{' '}
                        <span className="font-normal normal-case text-(--text-tertiary)">
                          {t('profile.fields.leaveBlank')}
                        </span>
                      </label>
                      <input
                        type="password"
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))}
                        readOnly={!editMode}
                        placeholder="••••••••"
                        className={`w-full rounded-xl border border-(--border) bg-(--surface-secondary) px-4 py-2.5 text-xs font-medium text-(--text-primary) outline-none focus:ring-2 focus:ring-(--focus) ${!editMode ? 'cursor-default opacity-90' : ''}`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-(--text-secondary) mb-1.5">{t('profile.fields.newPassword')}</label>
                      <input
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
                        readOnly={!editMode}
                        placeholder="••••••••"
                        className={`w-full rounded-xl border border-(--border) bg-(--surface-secondary) px-4 py-2.5 text-xs font-medium text-(--text-primary) outline-none focus:ring-2 focus:ring-(--focus) ${!editMode ? 'cursor-default opacity-90' : ''}`}
                      />
                      {/* Password strength meter — Weak / Medium / Strong. Renders only while editing. */}
                      {editMode && passwordForm.newPassword && (() => {
                        const pwd = passwordForm.newPassword;
                        const rules = [
                          pwd.length >= 8,
                          /[A-Z]/.test(pwd),
                          /[0-9]/.test(pwd),
                          /[^A-Za-z0-9]/.test(pwd),
                        ];
                        const score = rules.filter(Boolean).length;
                        const tier = score <= 1 ? 'weak' : score <= 3 ? 'medium' : 'strong';
                        const palette = {
                          weak: { bar: 'bg-rose-500', text: 'text-rose-600', label: t('profile.password.strength.weak'), width: 'w-1/3' },
                          medium: { bar: 'bg-amber-500', text: 'text-amber-600', label: t('profile.password.strength.medium'), width: 'w-2/3' },
                          strong: { bar: 'bg-emerald-500', text: 'text-emerald-600', label: t('profile.password.strength.strong'), width: 'w-full' },
                        }[tier];
                        return (
                          <div className="mt-1.5">
                            <div className="h-1 w-full rounded-full bg-(--surface-tertiary) overflow-hidden">
                              <div className={`h-full ${palette.bar} ${palette.width} transition-all`} />
                            </div>
                            <p className={`text-[10px] font-bold mt-1 ${palette.text}`}>
                              {palette.label} · {t('profile.password.strength.hint')}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Form Action Buttons: [Cancel] & [Save Changes] (only while editing) */}
                {editMode && (
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-(--border-light)">
                    <button
                      type="button"
                      onClick={handleResetForm}
                      disabled={submitting}
                      className="px-5 py-2.5 rounded-xl border border-(--border) text-(--text-secondary) font-bold text-xs hover:bg-(--surface-secondary) transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {t('cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-6 py-2.5 rounded-xl bg-(--brand) text-(--on-brand) font-bold text-xs shadow-xs hover:bg-(--brand-hover) transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {submitting ? t('profile.actions.updating') : t('profile.actions.saveChanges')}
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>
        )}

        {/* Tab 2: My Activity */}
        {currentTab === 'activity' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-(--border) bg-(--surface) p-6 sm:p-8 shadow-xs">
              <div className="mb-6 border-b border-(--border-light) pb-4">
                <h2 className="text-base font-bold text-(--text-primary)">
                  {t('profile.activity.title')}
                </h2>
                <p className="text-xs text-(--text-secondary) mt-0.5">
                  {t('profile.activity.description')}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <input
                  type="search"
                  value={activityQuery}
                  onChange={(e) => {
                    setActivityQuery(e.target.value);
                    setActivityPage(1);
                  }}
                  placeholder={t('profile.activity.searchPlaceholder')}
                  aria-label={t('profile.activity.searchLabel')}
                  className="w-full sm:flex-1 rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-medium text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus)"
                />
                <select
                  value={activitySort}
                  onChange={(e) => {
                    setActivitySort(e.target.value);
                    setActivityPage(1);
                  }}
                  aria-label={t('profile.activity.sortLabel')}
                  className="w-full sm:w-40 rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-medium text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus)"
                >
                  <option value="latest">{t('profile.activity.latest')}</option>
                  <option value="oldest">{t('profile.activity.oldest')}</option>
                </select>
              </div>

              {activityLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-14 bg-(--surface-secondary) rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : activityError ? (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
                  {activityError}
                </div>
              ) : activity.length === 0 ? (
                <div className="p-6 text-center text-xs text-(--text-tertiary) italic">
                  {t('profile.activity.empty')}
                </div>
              ) : visibleActivity.length === 0 ? (
                <div className="p-6 text-center text-xs text-(--text-tertiary) italic">
                  {t('profile.activity.noMatches')}
                </div>
              ) : (
                <>
                  <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                    {pagedActivity
                      .map((item) => (
                        <ActivityLogItem
                          key={`${item.type}-${item.entityId || item.title}-${item.occurredAt}`}
                          item={item}
                          role={user?.role ?? role}
                          language={language}
                          translate={t}
                        />
                      ))
                      .filter(Boolean)}
                  </div>
                  {totalActivityPages > 1 && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-xs">
                      <button
                        type="button"
                        disabled={safeActivityPage <= 1}
                        onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-1.5 bg-(--surface) border border-(--border) rounded-lg font-bold text-(--text-secondary) hover:bg-(--surface-secondary) transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {t('profile.activity.previous')}
                      </button>
                      <span className="px-3 py-1.5 font-mono font-bold text-(--text-secondary)">
                        {safeActivityPage} / {totalActivityPages}
                      </span>
                      <button
                        type="button"
                        disabled={safeActivityPage >= totalActivityPages}
                        onClick={() => setActivityPage((p) => Math.min(totalActivityPages, p + 1))}
                        className="px-3 py-1.5 bg-(--surface) border border-(--border) rounded-lg font-bold text-(--text-secondary) hover:bg-(--surface-secondary) transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {t('profile.activity.next')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

      </main>

      {/* Password Update Confirmation Popup Modal */}
      <Modal
        open={showPasswordConfirmModal}
        onClose={() => setShowPasswordConfirmModal(false)}
        title={t('profile.password.confirmTitle')}
        closeLabel={t('close')}
      >
        <div className="space-y-4 text-xs">
          <p className="text-(--text-secondary) leading-relaxed">
            {t('profile.password.confirmDescription')}
          </p>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-(--border-light)">
            <button
              type="button"
              onClick={() => setShowPasswordConfirmModal(false)}
              disabled={passwordSubmitting}
              className="px-4 py-2 rounded-xl border border-(--border) text-(--text-secondary) font-bold text-xs hover:bg-(--surface-secondary) transition-colors cursor-pointer disabled:opacity-50"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirmPasswordUpdate}
              disabled={passwordSubmitting}
              className="px-4 py-2 rounded-xl bg-(--brand) text-(--on-brand) font-bold text-xs hover:bg-(--brand-hover) transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {passwordSubmitting ? t('saving') : t('profile.password.confirmAction')}
            </button>
          </div>
        </div>
      </Modal>

      {/* OTP Email Verification Modal */}
      <Modal
        open={otpModalOpen}
        onClose={otpVerifying ? () => { } : closeOtpModal}
        title={t('profile.email.otp.title')}
        closeLabel={t('close')}
      >
        <div className="space-y-4 text-xs">
          <p className="text-(--text-secondary) leading-relaxed">
            {t('profile.email.otp.sentTo')} <strong className="text-(--text-primary)">{email}</strong>{t('profile.email.otp.instructions')}
          </p>

          <div className="flex justify-center">
            <OtpInput
              ref={otpFieldRef}
              length={6}
              autoFocus
              status={otpError ? 'error' : 'idle'}
              hint={otpError ? '' : t('profile.email.otp.codeHint')}
              errorMessage={otpError}
              onComplete={handleVerifyOtp}
              disabled={otpVerifying}
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-(--border-light)">
            <button
              type="button"
              onClick={() => handleRequestOtp()}
              disabled={otpCountdown > 0 || otpRequesting}
              className="text-xs font-bold text-(--brand) hover:underline disabled:text-(--text-tertiary) disabled:no-underline cursor-pointer disabled:cursor-not-allowed"
            >
              {otpRequesting
                ? t('profile.email.otp.sending')
                : otpCountdown > 0
                  ? t('profile.email.otp.resendIn', { seconds: otpCountdown })
                  : t('profile.email.otp.resendCode')}
            </button>
            <button
              type="button"
              onClick={() => otpFieldRef.current?.focus()}
              disabled={otpVerifying}
              className="px-5 py-2 rounded-xl bg-(--brand) text-(--on-brand) font-bold text-xs hover:bg-(--brand-hover) transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {otpVerifying ? t('saving') : t('profile.email.otp.focus')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Avatar Crop Modal */}
      <Modal
        open={!!avatarSrc}
        onClose={() => { if (!avatarUploading) setAvatarSrc((prev) => { if (prev) URL.revokeObjectURL(prev); return null; }); }}
        title={t('profile.avatar.cropTitle')}
        closeLabel={t('close')}
      >
        <div className="space-y-4 text-xs">
          {avatarSrc && (
            <div className="flex justify-center">
              <Suspense fallback={<div className="py-8 text-xs text-(--text-tertiary)">…</div>}>
              <ReactCrop
                crop={avatarCrop}
                onChange={(_, percentCrop) => setAvatarCrop(percentCrop)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={1}
                minWidth={50}
                minHeight={50}
              >
                <img
                  ref={avatarImgRef}
                  src={avatarSrc}
                  alt=""
                  className="max-h-[50vh] max-w-full"
                  onLoad={(e) => {
                    const { width, height } = e.currentTarget;
                    const size = Math.min(width, height) * 0.8;
                    const initial = {
                      unit: '%',
                      x: ((width - size) / 2 / width) * 100,
                      y: ((height - size) / 2 / height) * 100,
                      width: (size / width) * 100,
                      height: (size / height) * 100,
                    };
                    setAvatarCrop(initial);
                  }}
                />
              </ReactCrop>
              </Suspense>
            </div>
          )}
          {avatarError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
              {avatarError}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-(--border-light)">
            <button
              type="button"
              onClick={() => setAvatarSrc((prev) => { if (prev) URL.revokeObjectURL(prev); return null; })}
              disabled={avatarUploading}
              className="px-4 py-2 rounded-xl border border-(--border) text-(--text-secondary) font-bold text-xs hover:bg-(--surface-secondary) transition-colors cursor-pointer disabled:opacity-50"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={handleAvatarCropComplete}
              disabled={avatarUploading}
              className="px-5 py-2 rounded-xl bg-(--brand) text-(--on-brand) font-bold text-xs hover:bg-(--brand-hover) transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {avatarUploading ? t('saving') : t('profile.avatar.upload')}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
}

export default function Profile() {
  return <ProfileContent />;
}

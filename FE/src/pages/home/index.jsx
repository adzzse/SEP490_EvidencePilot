import { useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { homeText } from '../../locales/home';
import AppHeader from '../../components/layout/AppHeader';
import LoadingScreen from '../../components/ui/LoadingScreen';
import HeroSection from './HeroSection';
import StatsSection from './StatsSection';
import RolesSection from './RolesSection';
import WorkflowSection from './WorkflowSection';
import FeaturesSection from './FeaturesSection';
import PreviewSection from './PreviewSection';
import CtaSection from './CtaSection';
import FooterSection from './FooterSection';

// ponytail: mirrors loginOrigin.js defaultWorkspace — Home owns the post-auth
// forward so onboarding can route to '/' without knowing role destinations.
const WORKSPACE_BY_ROLE = {
  ADMIN: '/admin/dashboard',
  INSTRUCTOR: '/instructor/dashboard',
  STUDENT: '/student/projects',
};

export default function Home() {
  const { isAuthenticated, role, loading } = useAuth();
  const { language } = useLanguage();
  const t = homeText[language];
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem('splashSeen'));

  const handleSplashFinish = useCallback(() => {
    sessionStorage.setItem('splashSeen', '1');
    setShowSplash(false);
  }, []);

  // ponytail: root traffic controller — hold on a spinner while the session is
  // being verified (JWT validity unknown); invalid tokens resolve to the public
  // landing via AuthContext's 401/403 cleanup, valid ones forward by role.
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-(--page-bg)" role="status" aria-label="Loading">
        <div className="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isAuthenticated) {
    const destination = WORKSPACE_BY_ROLE[role] || WORKSPACE_BY_ROLE.STUDENT;
    return <Navigate to={destination} replace />;
  }

  if (showSplash) {
    return <LoadingScreen onFinish={handleSplashFinish} />;
  }

  return (
    <div className="min-h-screen bg-(--page-bg) text-(--text-primary) font-sans">
      <AppHeader variant="public" labels={t} />
      <HeroSection t={t} />
      <StatsSection t={t} />
      <RolesSection t={t} />
      <WorkflowSection t={t} />
      <FeaturesSection t={t} />
      <PreviewSection t={t} />
      <CtaSection t={t} />
      <FooterSection t={t} />
    </div>
  );
}

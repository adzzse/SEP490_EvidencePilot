import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuroraBackground } from '../components/ui/aurora-background';

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <AuroraBackground className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-md bg-(--surface) border border-(--border) rounded-3xl p-8 sm:p-10 shadow-2xl relative z-10">
        <p className="text-6xl sm:text-7xl font-black bg-gradient-to-r from-indigo-600 to-blue-500 bg-clip-text text-transparent mb-4">404</p>
        <h1 className="text-2xl font-bold text-(--text-primary) mb-2">{t('notFound') || 'Page Not Found'}</h1>
        <p className="text-sm text-(--text-secondary) mb-8">{t('notFoundMessage') || 'The page you are looking for does not exist or has been moved.'}</p>
        <Link
          to="/"
          className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-(--brand) hover:bg-(--brand-hover) text-(--on-brand) text-xs font-bold shadow-lg transition-all"
        >
          {t('backToHome') || 'Back to Home'}
        </Link>
      </div>
    </AuroraBackground>
  );
}

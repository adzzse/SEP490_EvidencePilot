import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import AnimateIn from '../../components/ui/AnimateIn';

export default function HeroSection({ t }) {
  const { isAuthenticated, role } = useAuth();
  const { language } = useLanguage();

  const wsLink = !isAuthenticated ? '/login'
    : role === 'ADMIN' ? '/admin/dashboard'
      : role === 'INSTRUCTOR' ? '/instructor/dashboard'
        : '/student/projects';

  return (
    <section className="relative pt-28 pb-12 md:pt-36 md:pb-16 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gradient-to-br from-indigo-200/20 to-blue-200/10 dark:from-indigo-500/10 dark:to-blue-500/5 rounded-full blur-3xl" />
      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        <AnimateIn>
          <div className="inline-flex items-center gap-2 bg-(--brand-soft) border border-indigo-100 dark:border-indigo-800 rounded-full px-4 py-1.5 mb-8">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-xs font-semibold text-(--brand-foreground)">{t.hero.stats}</span>
          </div>
        </AnimateIn>
        <AnimateIn delay={100}>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-light text-(--text-primary) leading-tight mb-6">
            {t.hero.titleStart}{language === 'vi' && <br />}{' '}
            <span className="font-bold bg-gradient-to-r from-[#1e3a8a] to-indigo-500 bg-clip-text text-transparent">
              {t.hero.titleHighlight}
            </span>
            <br className="hidden md:block" />
            {t.hero.titleEnd}
          </h1>
        </AnimateIn>
        <AnimateIn delay={200}>
          <p className="text-lg text-(--text-secondary) leading-relaxed max-w-2xl mx-auto mb-10">
            {t.hero.subtitle}
          </p>
        </AnimateIn>
        <AnimateIn delay={300}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {isAuthenticated ? (
              <Link to={wsLink} className="bg-(--brand) hover:bg-(--brand-hover) text-(--on-brand) px-8 py-3.5 rounded-xl font-semibold shadow-lg shadow-indigo-200 dark:shadow-none transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5">
                {t.nav.workspace}
              </Link>
            ) : (
              <Link to="/login" className="bg-(--brand) hover:bg-(--brand-hover) text-(--on-brand) px-8 py-3.5 rounded-xl font-semibold shadow-lg shadow-indigo-200 dark:shadow-none transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5">
                {t.hero.cta}
              </Link>
            )}
          </div>
        </AnimateIn>
      </div>
    </section>
  );
}

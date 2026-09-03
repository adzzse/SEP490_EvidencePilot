import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import AnimateIn from '../../components/ui/AnimateIn';
import { AuroraBackground } from '../../components/ui/aurora-background';

export default function HeroSection({ t }) {
  const { isAuthenticated, role } = useAuth();
  const { language } = useLanguage();

  const wsLink = !isAuthenticated ? '/login'
    : role === 'ADMIN' ? '/admin/dashboard'
      : role === 'INSTRUCTOR' ? '/instructor/dashboard'
        : '/student/projects';

  return (
    <section className="relative overflow-hidden">
      <AuroraBackground className="pt-28 pb-16 md:pt-36 md:pb-24 min-h-[80vh]">
        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
          <AnimateIn>
            <div className="inline-flex items-center gap-2 bg-(--brand-soft) border border-indigo-100 dark:border-indigo-800 rounded-full px-4 py-1.5 mb-8 shadow-xs">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-xs font-semibold text-(--brand-foreground)">{t.hero.stats}</span>
            </div>
          </AnimateIn>

          <AnimateIn delay={100}>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-light text-(--text-primary) leading-tight mb-6 tracking-tight">
              {t.hero.titleStart}{language === 'vi' && <br />}{' '}
              <span className="font-extrabold bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-400 dark:from-indigo-400 dark:via-blue-300 dark:to-indigo-200 bg-clip-text text-transparent">
                {t.hero.titleHighlight}
              </span>
              <br className="hidden md:block" />
              {t.hero.titleEnd}
            </h1>
          </AnimateIn>

          <AnimateIn delay={200}>
            <p className="text-base sm:text-lg text-(--text-secondary) leading-relaxed max-w-2xl mx-auto mb-10">
              {t.hero.subtitle}
            </p>
          </AnimateIn>

          <AnimateIn delay={300}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {isAuthenticated ? (
                <Link
                  to={wsLink}
                  className="bg-(--brand) hover:bg-(--brand-hover) text-(--on-brand) px-8 py-3.5 rounded-xl font-bold shadow-lg shadow-indigo-200/50 dark:shadow-none transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 cursor-pointer"
                >
                  {t.nav.workspace}
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="bg-(--brand) hover:bg-(--brand-hover) text-(--on-brand) px-8 py-3.5 rounded-xl font-bold shadow-lg shadow-indigo-200/50 dark:shadow-none transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 cursor-pointer"
                >
                  {t.hero.cta}
                </Link>
              )}
            </div>
          </AnimateIn>
        </div>
      </AuroraBackground>
    </section>
  );
}

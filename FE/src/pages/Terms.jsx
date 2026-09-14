import { useTranslation } from 'react-i18next';
import StaticPageLayout from '../components/layout/StaticPageLayout';
import AnimateIn from '../components/ui/AnimateIn';

export default function Terms() {
  const { t } = useTranslation();
  const labels = t('home', { returnObjects: true });

  const sections = [
    { title: t('home.terms.section1Title'), body: t('home.terms.section1') },
    { title: t('home.terms.section2Title'), body: t('home.terms.section2') },
    { title: t('home.terms.section3Title'), body: [t('home.terms.section3p1'), t('home.terms.section3p2')] },
    { title: t('home.terms.section4Title'), body: t('home.terms.section4') },
    { title: t('home.terms.section5Title'), body: t('home.terms.section5') },
    { title: t('home.terms.section6Title'), body: t('home.terms.section6') },
    { title: t('home.terms.section7Title'), body: t('home.terms.section7') },
    { title: t('home.terms.section8Title'), body: t('home.terms.section8') },
  ];

  return (
    <StaticPageLayout t={labels}>
      <div className="max-w-3xl mx-auto px-6">
        <AnimateIn>
          <h1 className="text-3xl md:text-4xl font-black text-(--brand-foreground) tracking-tight mb-2">{t('home.terms.metaTitle')}</h1>
          <p className="text-xs font-semibold text-(--text-tertiary) mb-8">{t('home.terms.lastUpdated')}</p>
          <div className="bg-(--surface) border border-(--border) rounded-2xl p-6 sm:p-8 mb-8 shadow-xs">
            <p className="text-(--text-secondary) leading-relaxed">{t('home.terms.intro')}</p>
          </div>
        </AnimateIn>

        {sections.map((s, i) => (
          <AnimateIn key={i} delay={i * 60}>
            <section className="mb-6 bg-(--surface) border border-(--border) rounded-2xl p-6 shadow-xs">
              <h2 className="text-lg font-bold text-(--text-primary) mb-3">{s.title}</h2>
              {Array.isArray(s.body) ? (
                s.body.map((p, j) => <p key={j} className="text-(--text-secondary) text-sm leading-relaxed mb-3 last:mb-0">{p}</p>)
              ) : (
                <p className="text-(--text-secondary) text-sm leading-relaxed">{s.body}</p>
              )}
            </section>
          </AnimateIn>
        ))}
      </div>
    </StaticPageLayout>
  );
}

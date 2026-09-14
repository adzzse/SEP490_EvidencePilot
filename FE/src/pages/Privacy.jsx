import { useTranslation } from 'react-i18next';
import StaticPageLayout from '../components/layout/StaticPageLayout';
import AnimateIn from '../components/ui/AnimateIn';

export default function Privacy() {
  const { t } = useTranslation();
  const labels = t('home', { returnObjects: true });

  const sections = [
    { title: t('home.privacy.section1Title'), body: t('home.privacy.section1') },
    { title: t('home.privacy.section2Title'), body: t('home.privacy.section2') },
    { title: t('home.privacy.section3Title'), body: t('home.privacy.section3') },
    { title: t('home.privacy.section4Title'), body: t('home.privacy.section4') },
    { title: t('home.privacy.section5Title'), body: t('home.privacy.section5') },
    { title: t('home.privacy.section6Title'), body: t('home.privacy.section6') },
    { title: t('home.privacy.section7Title'), body: t('home.privacy.section7') },
    { title: t('home.privacy.section8Title'), body: t('home.privacy.section8') },
    { title: t('home.privacy.section9Title'), body: t('home.privacy.section9') },
  ];

  return (
    <StaticPageLayout t={labels}>
      <div className="max-w-3xl mx-auto px-6">
        <AnimateIn>
          <h1 className="text-3xl md:text-4xl font-black text-(--brand-foreground) tracking-tight mb-2">{t('home.privacy.metaTitle')}</h1>
          <p className="text-xs font-semibold text-(--text-tertiary) mb-8">{t('home.privacy.lastUpdated')}</p>
          <div className="bg-(--surface) border border-(--border) rounded-2xl p-6 sm:p-8 mb-8 shadow-xs">
            <p className="text-(--text-secondary) leading-relaxed">{t('home.privacy.intro')}</p>
          </div>
        </AnimateIn>

        {sections.map((s, i) => (
          <AnimateIn key={i} delay={i * 60}>
            <section className="mb-6 bg-(--surface) border border-(--border) rounded-2xl p-6 shadow-xs">
              <h2 className="text-lg font-bold text-(--text-primary) mb-3">{s.title}</h2>
              <p className="text-(--text-secondary) text-sm leading-relaxed">{s.body}</p>
            </section>
          </AnimateIn>
        ))}
      </div>
    </StaticPageLayout>
  );
}

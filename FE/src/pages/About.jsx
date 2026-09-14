import { useTranslation } from 'react-i18next';
import StaticPageLayout from '../components/layout/StaticPageLayout';
import AnimateIn from '../components/ui/AnimateIn';

export default function About() {
  const { t } = useTranslation();
  const labels = t('home', { returnObjects: true });

  const sections = [
    { title: t('home.aboutPage.missionTitle'), body: t('home.aboutPage.missionDesc') },
    { title: t('home.aboutPage.storyTitle'), body: t('home.aboutPage.storyDesc') },
    { title: t('home.aboutPage.techTitle'), body: t('home.aboutPage.techDesc') },
    { title: t('home.aboutPage.teamTitle'), body: t('home.aboutPage.teamDesc') },
  ];

  return (
    <StaticPageLayout t={labels}>
      <div className="max-w-3xl mx-auto px-6">
        <AnimateIn>
          <h1 className="text-3xl md:text-4xl font-black text-(--brand-foreground) tracking-tight mb-10">{t('home.aboutPage.metaTitle')}</h1>
        </AnimateIn>

        {sections.map((s, i) => (
          <AnimateIn key={i} delay={i * 80}>
            <section className="mb-10 bg-(--surface) border border-(--border) rounded-2xl p-6 sm:p-8 shadow-xs">
              <h2 className="text-xl font-bold text-(--text-primary) mb-3">{s.title}</h2>
              <p className="text-(--text-secondary) leading-relaxed text-sm sm:text-base">{s.body}</p>
            </section>
          </AnimateIn>
        ))}
      </div>
    </StaticPageLayout>
  );
}

import { useLanguage } from '../context/LanguageContext';
import { homeText } from '../locales/home';
import StaticPageLayout from '../components/layout/StaticPageLayout';
import AnimateIn from '../components/ui/AnimateIn';

export default function About() {
  const { language } = useLanguage();
  const t = homeText[language].aboutPage;

  const sections = [
    { title: t.missionTitle, body: t.missionDesc },
    { title: t.storyTitle, body: t.storyDesc },
    { title: t.techTitle, body: t.techDesc },
    { title: t.teamTitle, body: t.teamDesc },
  ];

  return (
    <StaticPageLayout t={homeText[language]}>
      <div className="max-w-3xl mx-auto px-6">
        <AnimateIn>
          <h1 className="text-3xl md:text-4xl font-black text-(--brand-foreground) tracking-tight mb-10">{t.metaTitle}</h1>
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

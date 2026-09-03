import { useLanguage } from '../context/LanguageContext';
import { homeText } from '../locales/home';
import StaticPageLayout from '../components/layout/StaticPageLayout';
import AnimateIn from '../components/ui/AnimateIn';

export default function Privacy() {
  const { language } = useLanguage();
  const t = homeText[language].privacy;

  const sections = [
    { title: t.section1Title, body: t.section1 },
    { title: t.section2Title, body: t.section2 },
    { title: t.section3Title, body: t.section3 },
    { title: t.section4Title, body: t.section4 },
    { title: t.section5Title, body: t.section5 },
    { title: t.section6Title, body: t.section6 },
    { title: t.section7Title, body: t.section7 },
    { title: t.section8Title, body: t.section8 },
    { title: t.section9Title, body: t.section9 },
  ];

  return (
    <StaticPageLayout t={homeText[language]}>
      <div className="max-w-3xl mx-auto px-6">
        <AnimateIn>
          <h1 className="text-3xl md:text-4xl font-black text-(--brand-foreground) tracking-tight mb-2">{t.metaTitle}</h1>
          <p className="text-xs font-semibold text-(--text-tertiary) mb-8">{t.lastUpdated}</p>
          <div className="bg-(--surface) border border-(--border) rounded-2xl p-6 sm:p-8 mb-8 shadow-xs">
            <p className="text-(--text-secondary) leading-relaxed">{t.intro}</p>
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

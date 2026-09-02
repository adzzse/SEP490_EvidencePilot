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
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">{t.metaTitle}</h1>
          <p className="text-sm text-gray-500 mb-10">{t.lastUpdated}</p>
          <p className="text-gray-600 leading-relaxed mb-10">{t.intro}</p>
        </AnimateIn>

        {sections.map((s, i) => (
          <AnimateIn key={i} delay={i * 60}>
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{s.title}</h2>
              <p className="text-gray-600 leading-relaxed">{s.body}</p>
            </section>
          </AnimateIn>
        ))}
      </div>
    </StaticPageLayout>
  );
}

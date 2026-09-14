import { useTranslation } from 'react-i18next';
import AnimateIn from '../../components/ui/AnimateIn';

const featuresList = [
  'structuredData', 'citationReview', 'feedback', 'documentExtraction', 'vectorSearch', 'realtime'
];

function FeatureCard({ feature, index }) {
  const { t } = useTranslation();
  const dots = ['bg-blue-500', 'bg-amber-500', 'bg-emerald-500', 'bg-purple-500', 'bg-cyan-500', 'bg-rose-500'];
  return (
    <AnimateIn delay={80 * index}>
      <div className="bg-(--surface-secondary) rounded-2xl p-6 border border-(--border-light) hover:border-indigo-200 dark:hover:border-indigo-700 hover:shadow-md transition-all duration-300">
        <div className={`w-3 h-3 rounded-full ${dots[index % dots.length]} mb-4`} />
        <h3 className="font-bold text-(--text-primary) mb-2">{t(`home.features.${feature}.title`)}</h3>
        <p className="text-sm text-(--text-secondary) leading-relaxed">{t(`home.features.${feature}.desc`)}</p>
      </div>
    </AnimateIn>
  );
}

export default function FeaturesSection() {
  const { t } = useTranslation();

  return (
    <section id="features" className="py-20 bg-(--surface)">
      <div className="max-w-6xl mx-auto px-6">
        <AnimateIn>
          <h2 className="text-2xl md:text-3xl font-bold text-center text-(--text-primary) mb-3">{t('home.features.heading')}</h2>
          <p className="text-(--text-secondary) text-center mb-12 max-w-xl mx-auto">{t('home.features.subheading')}</p>
        </AnimateIn>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {featuresList.map((feature, i) => <FeatureCard key={feature} feature={feature} index={i} />)}
        </div>
      </div>
    </section>
  );
}

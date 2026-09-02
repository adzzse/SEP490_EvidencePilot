import AppHeader from '../../components/layout/AppHeader.jsx';
import Breadcrumb from '../../components/layout/Breadcrumb.jsx';
import SourceLibraryPanel from '../../components/Instructor/SourceLibraryPanel.jsx';
import { instructorText } from '../../locales';
import { useLanguage } from '../../context/LanguageContext';

export default function SourceLibrary() {
  const { language } = useLanguage();
  const t = instructorText[language];

  return (
    <div className="min-h-screen bg-(--page-bg) text-(--text-primary) font-sans">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Breadcrumb
          items={[
            { label: t.dashboard, path: '/instructor/dashboard' },
            { label: t.sourceLibrary }
          ]}
        />
        <SourceLibraryPanel />
      </main>
    </div>
  );
}

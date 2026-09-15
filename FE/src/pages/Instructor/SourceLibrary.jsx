import AppHeader from '../../components/layout/AppHeader.jsx';
import Breadcrumb from '../../components/layout/Breadcrumb.jsx';
import SourceLibraryPanel from '../../components/Instructor/SourceLibraryPanel.jsx';
import { useTranslation } from 'react-i18next';

export default function SourceLibrary() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-(--page-bg) text-(--text-primary) font-sans">
      <AppHeader />
      <main className="max-w-[1400px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Breadcrumb
          items={[
            { label: t('instructor.sourceLibrary.dashboard'), path: '/instructor/dashboard' },
            { label: t('instructor.sourceLibrary.sourceLibrary') }
          ]}
        />
        <SourceLibraryPanel />
      </main>
    </div>
  );
}

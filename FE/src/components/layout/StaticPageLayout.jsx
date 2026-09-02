import AppHeader from './AppHeader';
import FooterSection from '../../pages/home/FooterSection';

export default function StaticPageLayout({ t, children }) {
  return (
    <div className="min-h-screen bg-[#fcfcfc] text-[#333] font-sans flex flex-col">
      <AppHeader variant="public" labels={t} />
      <main className="flex-1 pt-24 pb-16">
        {children}
      </main>
      <FooterSection t={t} />
    </div>
  );
}

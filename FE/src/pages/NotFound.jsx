import { useTranslation } from 'react-i18next';
import { AuroraBackground } from '../components/ui/aurora-background';
import Error404 from '../components/ui/Error404.jsx';

export default function NotFound() {
  const { t, i18n } = useTranslation();
  // ponytail: brand marks stay literal (no locale keys) so a missing key can
  // never render as raw text on the page.
  const curvedTop = 'Evidence Pilot';
  const curvedBottom = i18n.language === 'vi' ? 'Không gian nghiên cứu' : 'Research Workspace';

  return (
    <AuroraBackground className="min-h-screen flex items-center justify-center p-6">
      <div className="relative z-10">
        <Error404
          postcardImage="/404/404.jpg"
          postcardAlt={t('Page Not Found') || 'Page Not Found'}
          curvedTextTop={curvedTop}
          curvedTextBottom={curvedBottom}
          heading={t('Page Not Found') || 'Page Not Found'}
          subtext={t('notFoundMessage') || 'The page you are looking for does not exist or has been moved.'}
          backButtonLabel={t('backToHome') || 'Back to Home'}
          backButtonHref="/"
        />
      </div>
    </AuroraBackground>
  );
}

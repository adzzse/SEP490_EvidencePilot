import Modal from './Modal.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { ProfileContent } from '../../pages/Profile.jsx';

export default function ProfileModal({ open, onClose }) {
  const { language } = useLanguage();
  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={language === 'vi' ? 'Hồ sơ cá nhân' : 'My Profile'}
      closeLabel={language === 'vi' ? 'Đóng' : 'Close'}
      wide
    >
      <ProfileContent embedded />
    </Modal>
  );
}

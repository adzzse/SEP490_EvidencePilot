import Modal from './Modal.jsx';
import { useTranslation } from 'react-i18next';
import { ProfileContent } from '../../pages/Profile.jsx';

export default function ProfileModal({ open, onClose }) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('shell.profileModal.title')}
      closeLabel={t('shell.profileModal.close')}
      wide
    >
      <ProfileContent embedded />
    </Modal>
  );
}

import MessagesTab from '@/appScreens/messages/messages';
import LoginRequiredOverlay from '@/components/LoginRequiredOverlay';
import { useTranslation } from 'react-i18next';

export default function Messages() {
  const { t } = useTranslation();
  return (
    <LoginRequiredOverlay
      headerTitle={t('messages.title')}
      icon="💬"
      message={t('messages.loginRequired')}
      hint={t('messages.loginHint')}
    >
      <MessagesTab />
    </LoginRequiredOverlay>
  );
}
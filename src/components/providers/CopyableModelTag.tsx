import { useTranslation } from 'react-i18next';
import type { ModelAlias } from '@/types';
import { useNotificationStore } from '@/stores';
import { copyToClipboard } from '@/utils/clipboard';

interface CopyableModelTagProps {
  model: ModelAlias;
  className: string;
  nameClassName: string;
  aliasClassName: string;
}

export function CopyableModelTag({
  model,
  className,
  nameClassName,
  aliasClassName,
}: CopyableModelTagProps) {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();

  const copyValue = model.alias && model.alias !== model.name ? model.alias : model.name;

  const handleClick = async () => {
    const copied = await copyToClipboard(copyValue);
    showNotification(
      copied
        ? `${t('notification.link_copied', { defaultValue: 'Copied to clipboard' })}: ${copyValue}`
        : t('notification.copy_failed', { defaultValue: 'Copy failed' }),
      copied ? 'success' : 'error'
    );
  };

  return (
    <button type="button" className={className} onClick={() => void handleClick()} title={copyValue}>
      <span className={nameClassName}>{model.name}</span>
      {model.alias && model.alias !== model.name ? (
        <span className={aliasClassName}>{model.alias}</span>
      ) : null}
    </button>
  );
}

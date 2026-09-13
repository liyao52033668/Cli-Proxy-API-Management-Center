import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ModelDiscoveryContent, type ModelDiscoveryContentProps } from './ModelDiscoveryContent';

export interface ModelDiscoveryModalProps<T> extends ModelDiscoveryContentProps<T> {
  open: boolean;
  title: string;
  onClose: () => void;
  onApply: () => void;
  canApply: boolean;
  applyLabel?: string;
  width?: number;
}

export function ModelDiscoveryModal<T>({
  open,
  title,
  onClose,
  onApply,
  canApply,
  applyLabel,
  width = 720,
  fetching,
  ...contentProps
}: ModelDiscoveryModalProps<T>) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      width={width}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={fetching}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={onApply} disabled={!canApply}>
            {applyLabel || t('ai_providers.codex_models_fetch_apply')}
          </Button>
        </>
      }
    >
      <ModelDiscoveryContent {...contentProps} fetching={fetching} />
    </Modal>
  );
}

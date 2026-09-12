import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import type { AuthFileModelItem } from '@/features/authFiles/constants';

type ModelsError = 'unsupported' | null;

const modelsCache = new Map<string, AuthFileModelItem[]>();

export const clearCacheForAuth = (authFileName?: string) => {
  if (authFileName) {
    modelsCache.delete(authFileName);
  } else {
    modelsCache.clear();
  }
};

export type UseAuthFilesModelsResult = {
  modelsModalOpen: boolean;
  modelsLoading: boolean;
  modelsList: AuthFileModelItem[];
  modelsFileName: string;
  modelsFileType: string;
  modelsError: ModelsError;
  showModels: (item: AuthFileItem) => Promise<void>;
  closeModelsModal: () => void;
  clearCacheForAuth: (authFileName?: string) => void;
};

export function useAuthFilesModels(): UseAuthFilesModelsResult {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [modelsModalOpen, setModelsModalOpen] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsList, setModelsList] = useState<AuthFileModelItem[]>([]);
  const [modelsFileName, setModelsFileName] = useState('');
  const [modelsFileType, setModelsFileType] = useState('');
  const [modelsError, setModelsError] = useState<ModelsError>(null);
  const currentNameRef = useRef('');

  const closeModelsModal = useCallback(() => {
    setModelsModalOpen(false);
  }, []);

  const showModels = useCallback(
    async (item: AuthFileItem) => {
      const name = item.name;
      currentNameRef.current = name;
      setModelsFileName(name);
      setModelsFileType(item.type || '');
      setModelsError(null);
      setModelsModalOpen(true);

      // Stale-while-revalidate: serve the cached list immediately, then always
      // refetch in the background so excluded-model changes (probe auto-exclude,
      // per-file editor, global OAuth exclusions) show up on the next open.
      const cached = modelsCache.get(name);
      if (cached) {
        setModelsList(cached);
        setModelsLoading(false);
      } else {
        setModelsList([]);
        setModelsLoading(true);
      }

      try {
        const models = await authFilesApi.getModelsForAuthFile(name);
        modelsCache.set(name, models);
        if (currentNameRef.current !== name) return;
        setModelsList(models);
      } catch (err) {
        if (currentNameRef.current !== name) return;
        const errorMessage = err instanceof Error ? err.message : '';
        if (
          errorMessage.includes('404') ||
          errorMessage.includes('not found') ||
          errorMessage.includes('Not Found')
        ) {
          setModelsError('unsupported');
          return;
        }
        showNotification(`${t('notification.load_failed')}: ${errorMessage}`, 'error');
      } finally {
        if (currentNameRef.current === name) {
          setModelsLoading(false);
        }
      }
    },
    [showNotification, t]
  );

  const handleClearCacheForAuth = useCallback((authFileName?: string) => {
    clearCacheForAuth(authFileName);
  }, []);

  return {
    modelsModalOpen,
    modelsLoading,
    modelsList,
    modelsFileName,
    modelsFileType,
    modelsError,
    showModels,
    closeModelsModal,
    clearCacheForAuth: handleClearCacheForAuth,
  };
}

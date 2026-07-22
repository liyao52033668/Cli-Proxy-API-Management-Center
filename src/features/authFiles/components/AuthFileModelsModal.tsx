import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import type { AuthFileModelItem } from '@/features/authFiles/constants';
import {
  getAuthFileProbeMediaKind,
  isAuthFileProbeMediaModel,
  isModelExcluded
} from '@/features/authFiles/constants';
import {
  authFilesApi,
  type AuthFileModelTestResult,
  type AuthFileModelTestStatus
} from '@/services/api/authFiles';
import styles from '@/pages/AuthFilesPage.module.scss';

export type AuthFileModelsModalProps = {
  open: boolean;
  fileName: string;
  fileType: string;
  loading: boolean;
  error: 'unsupported' | null;
  models: AuthFileModelItem[];
  excluded: Record<string, string[]>;
  /** File-level excluded_models currently known by the list API / local state. */
  fileExcludedModels?: string[];
  onClose: () => void;
  onCopyText: (text: string) => void;
  /** Called when a failed probe auto-appends models to this auth file's excluded_models. */
  onFileExcludedModelsChange?: (fileName: string, models: string[]) => void;
};

type ModelTestState = {
  status: AuthFileModelTestStatus;
  latency_ms?: number;
  error?: string;
  excluded_added?: boolean;
};

const formatLatency = (ms?: number): string => {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`;
};

const normalizeModelId = (value: string): string => String(value ?? '').trim().toLowerCase();

const resolveProviderLabel = (model: AuthFileModelItem, fileType: string): string => {
  const type = String(model.type ?? '').trim();
  if (type) return type;
  const ownedBy = String(model.owned_by ?? '').trim();
  if (ownedBy) return ownedBy;
  const fallback = String(fileType ?? '').trim();
  return fallback || 'provider';
};

export function AuthFileModelsModal(props: AuthFileModelsModalProps) {
  const { t } = useTranslation();
  const {
    open,
    fileName,
    fileType,
    loading,
    error,
    models,
    excluded,
    fileExcludedModels,
    onClose,
    onCopyText,
    onFileExcludedModelsChange
  } = props;

  const [testStates, setTestStates] = useState<Record<string, ModelTestState>>({});
  const [localFileExcluded, setLocalFileExcluded] = useState<string[]>([]);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const closedRef = useRef(false);

  const abortAll = useCallback(() => {
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();
  }, []);

  useEffect(() => {
    if (!open) {
      closedRef.current = true;
      abortAll();
      setTestStates({});
      setLocalFileExcluded([]);
      return;
    }
    closedRef.current = false;
    setTestStates({});
    setLocalFileExcluded(
      Array.isArray(fileExcludedModels)
        ? fileExcludedModels.map(normalizeModelId).filter(Boolean)
        : []
    );
  }, [open, fileName, fileExcludedModels, abortAll]);

  useEffect(() => {
    return () => {
      closedRef.current = true;
      abortAll();
    };
  }, [abortAll]);

  const fileExcludedSet = useMemo(
    () => new Set(localFileExcluded.map(normalizeModelId)),
    [localFileExcluded]
  );

  const applyResult = useCallback(
    (modelId: string, result: AuthFileModelTestResult) => {
      if (closedRef.current) return;

      const nextExcluded =
        Array.isArray(result.excluded_models) && result.excluded_models.length >= 0
          ? result.excluded_models.map(normalizeModelId).filter(Boolean)
          : null;

      if (nextExcluded) {
        setLocalFileExcluded(nextExcluded);
        if (result.excluded_added) {
          onFileExcludedModelsChange?.(fileName, nextExcluded);
        }
      } else if (result.excluded_added) {
        const modelKey = normalizeModelId(modelId);
        setLocalFileExcluded((prev) => {
          if (prev.some((item) => item === modelKey)) return prev;
          const merged = [...prev, modelKey].sort();
          onFileExcludedModelsChange?.(fileName, merged);
          return merged;
        });
      }

      setTestStates((prev) => ({
        ...prev,
        [modelId]: {
          status: result.status,
          latency_ms: result.latency_ms,
          error: result.error,
          excluded_added: Boolean(result.excluded_added)
        }
      }));
    },
    [fileName, onFileExcludedModelsChange]
  );

  const testModel = useCallback(
    async (modelId: string, modelMeta?: AuthFileModelItem) => {
      const name = String(fileName ?? '').trim();
      const model = String(modelId ?? '').trim();
      if (!name || !model) return;

      if (isAuthFileProbeMediaModel(modelMeta ?? model)) {
        const kind = getAuthFileProbeMediaKind(modelMeta ?? model) || 'image';
        setTestStates((prev) => ({
          ...prev,
          [model]: {
            status: 'unsupported',
            error: t('auth_files.models_test_media_unsupported_error', {
              defaultValue:
                kind === 'video'
                  ? '视频生成模型不支持聊天连通性测试'
                  : '图片生成模型不支持聊天连通性测试',
              kind
            })
          }
        }));
        return;
      }

      const existing = abortControllersRef.current.get(model);
      if (existing) {
        existing.abort();
        abortControllersRef.current.delete(model);
      }

      const controller = new AbortController();
      abortControllersRef.current.set(model, controller);

      setTestStates((prev) => ({
        ...prev,
        [model]: { status: 'running' }
      }));

      try {
        const result = await authFilesApi.testAuthFileModel(
          { name, model },
          { signal: controller.signal }
        );
        applyResult(model, result);
      } catch (err) {
        if (controller.signal.aborted || closedRef.current) return;
        const message = err instanceof Error ? err.message : String(err ?? '');
        const lower = message.toLowerCase();
        const isTimeout =
          lower.includes('timeout') || lower.includes('timed out') || lower.includes('exceeded');
        setTestStates((prev) => ({
          ...prev,
          [model]: {
            status: isTimeout ? 'timeout' : 'failed',
            error: message || t('auth_files.models_test_failed', { defaultValue: '测试失败' })
          }
        }));
      } finally {
        const current = abortControllersRef.current.get(model);
        if (current === controller) {
          abortControllersRef.current.delete(model);
        }
      }
    },
    [fileName, applyResult, t]
  );

  const handleClose = useCallback(() => {
    closedRef.current = true;
    abortAll();
    onClose();
  }, [abortAll, onClose]);

  const providerChipLabel = useCallback(
    (
      providerLabel: string,
      state?: ModelTestState,
      mediaKind?: ReturnType<typeof getAuthFileProbeMediaKind>
    ): string => {
      if (mediaKind) {
        return mediaKind === 'video'
          ? t('auth_files.models_test_media_video', { defaultValue: '视频' })
          : t('auth_files.models_test_media_image', { defaultValue: '生图' });
      }
      if (!state || state.status === 'idle') return providerLabel;
      if (state.status === 'running') {
        return t('auth_files.models_test_running_short', { defaultValue: '测试中' });
      }
      if (state.status === 'success') {
        const latency = formatLatency(state.latency_ms);
        return latency
          ? t('auth_files.models_test_success_latency', {
              defaultValue: '成功 {{latency}}',
              latency
            })
          : t('auth_files.models_test_success', { defaultValue: '成功' });
      }
      if (state.status === 'timeout') {
        return state.excluded_added
          ? t('auth_files.models_test_timeout_excluded', { defaultValue: '超时，已加入排除' })
          : t('auth_files.models_test_timeout', { defaultValue: '超时' });
      }
      if (state.status === 'disabled') {
        return t('auth_files.models_test_disabled', { defaultValue: '已禁用' });
      }
      if (state.status === 'unsupported') {
        return t('auth_files.models_test_unsupported', { defaultValue: '不支持' });
      }
      return state.excluded_added
        ? t('auth_files.models_test_failed_excluded', { defaultValue: '失败，已加入排除' })
        : t('auth_files.models_test_failed', { defaultValue: '失败' });
    },
    [t]
  );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('auth_files.models_title', { defaultValue: '支持的模型' }) + ` - ${fileName}`}
      footer={
        <Button variant="secondary" onClick={handleClose}>
          {t('common.close')}
        </Button>
      }
    >
      {loading ? (
        <div className={styles.hint}>
          {t('auth_files.models_loading', { defaultValue: '正在加载模型列表...' })}
        </div>
      ) : error === 'unsupported' ? (
        <EmptyState
          title={t('auth_files.models_unsupported', { defaultValue: '当前版本不支持此功能' })}
          description={t('auth_files.models_unsupported_desc', {
            defaultValue: '请更新 CLI Proxy API 到最新版本后重试'
          })}
        />
      ) : models.length === 0 ? (
        <EmptyState
          title={t('auth_files.models_empty', { defaultValue: '该凭证暂无可用模型' })}
          description={t('auth_files.models_empty_desc', {
            defaultValue: '该认证凭证可能尚未被服务器加载或没有绑定任何模型'
          })}
        />
      ) : (
        <div className={styles.modelsList}>
          <div className={styles.modelsTestHint}>
            {t('auth_files.models_test_hint', {
              defaultValue:
                '点击右侧提供商标签测试连通性；失败或超时会自动写入该文件的排除模型。生图/视频模型不支持此测试。'
            })}
          </div>
          {models.map((model) => {
            const oauthExcluded = isModelExcluded(model.id, fileType, excluded);
            const fileExcluded = fileExcludedSet.has(normalizeModelId(model.id));
            const excludedModel = oauthExcluded || fileExcluded;
            const mediaKind = getAuthFileProbeMediaKind(model);
            const mediaModel = mediaKind !== '';
            const state = testStates[model.id];
            const running = state?.status === 'running';
            const providerLabel = resolveProviderLabel(model, fileType);
            const chipText = providerChipLabel(providerLabel, state, mediaKind);
            const chipClass = [
              styles.modelProviderChip,
              !mediaModel && state?.status === 'success' ? styles.modelProviderChipSuccess : '',
              !mediaModel && (state?.status === 'failed' || state?.status === 'timeout')
                ? styles.modelProviderChipFailed
                : '',
              !mediaModel && state?.status === 'running' ? styles.modelProviderChipRunning : '',
              mediaModel ||
              state?.status === 'disabled' ||
              state?.status === 'unsupported'
                ? styles.modelProviderChipMuted
                : ''
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div
                key={model.id}
                className={`${styles.modelItem} ${excludedModel ? styles.modelItemExcluded : ''}`}
              >
                <div
                  className={styles.modelItemMain}
                  onClick={() => {
                    onCopyText(model.id);
                  }}
                  title={
                    fileExcluded
                      ? t('auth_files.models_file_excluded_hint', {
                          defaultValue: '此模型已写入该认证文件的排除模型列表'
                        })
                      : oauthExcluded
                        ? t('auth_files.models_excluded_hint', {
                            defaultValue: '此 OAuth 模型已被禁用'
                          })
                        : t('common.copy', { defaultValue: '点击复制' })
                  }
                >
                  <span className={styles.modelId}>{model.id}</span>
                  {model.display_name && model.display_name !== model.id && (
                    <span className={styles.modelDisplayName}>{model.display_name}</span>
                  )}
                  {fileExcluded && (
                    <span className={styles.modelExcludedBadge}>
                      {t('auth_files.models_file_excluded_badge', { defaultValue: '文件已排除' })}
                    </span>
                  )}
                  {!fileExcluded && oauthExcluded && (
                    <span className={styles.modelExcludedBadge}>
                      {t('auth_files.models_excluded_badge', { defaultValue: '已禁用' })}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  className={chipClass}
                  disabled={running || mediaModel}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (mediaModel) return;
                    void testModel(model.id, model);
                  }}
                  title={
                    mediaModel
                      ? t('auth_files.models_test_media_unsupported_title', {
                          defaultValue:
                            mediaKind === 'video'
                              ? '视频生成模型不支持聊天连通性测试'
                              : '图片生成模型不支持聊天连通性测试'
                        })
                      : state?.error ||
                        t('auth_files.models_test_provider_title', {
                          defaultValue: '点击测试 {{provider}}',
                          provider: providerLabel
                        })
                  }
                >
                  {running && <span className={styles.modelProviderChipSpinner} aria-hidden="true" />}
                  <span className={styles.modelProviderChipText}>{chipText}</span>
                </button>

                {state?.error && state.status !== 'running' && state.status !== 'success' && (
                  <div className={styles.modelTestError} title={state.error}>
                    {state.error}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

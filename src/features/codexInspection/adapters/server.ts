import type {
  CodexInspectionAction,
  CodexInspectionSettings,
} from '@/features/codexInspection/model/types';
import { codexInspectionApi } from '@/services/api/codexInspection';

export function createServerCodexInspectionAdapter() {
  return {
    loadSnapshot: () => codexInspectionApi.getSnapshot(),
    listProviders: () => codexInspectionApi.listProviders(),
    run: (provider: string, fileNames?: string[]) => codexInspectionApi.run(provider, fileNames),
    saveSettings: (settings: CodexInspectionSettings) =>
      codexInspectionApi.updateSettings(settings),
    execute: async (action: CodexInspectionAction, fileNames: string[], confirmDelete = false) => {
      const actionResult = await codexInspectionApi.executeActions({
        action,
        fileNames,
        confirmDelete,
      });
      return { snapshot: actionResult.snapshot, logs: actionResult.logs };
    },
  };
}

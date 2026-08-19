/**
 * API 密钥管理
 */

import { apiClient } from './client';

export const apiKeysApi = {
  async list(): Promise<string[]> {
    const data = await apiClient.get<Record<string, unknown>>('/api-keys');
    const keys = data['api-keys'] ?? data.apiKeys;
    return Array.isArray(keys) ? keys.map((key) => String(key)) : [];
  },

  replace: (keys: string[]) => apiClient.put('/api-keys', keys),

  update: (index: number, value: string) => apiClient.patch('/api-keys', { index, value }),

  delete: (index: number) => apiClient.delete(`/api-keys?index=${index}`),

  /**
   * 设置指定 API key 的模型白名单
   * @param key API key
   * @param models 模型列表，空数组表示显示所有模型
   */
  setModels: (key: string, models: string[]) =>
    apiClient.patch('/api-keys/models', { key, models })
};

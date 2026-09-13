import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

export const parseIndexParam = (value: string | undefined): number | null => {
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
};

export interface EditIndexParamResult {
  /** 路由中是否存在 index 参数（即是否有 /:index） */
  hasIndexParam: boolean;
  /** 解析后的有效非负整数下标；不存在或非法时为 null */
  editIndex: number | null;
  /** 路由中传了 index 参数但不是合法的非负整数 */
  invalidIndexParam: boolean;
}

export function useEditIndexParam(paramName = 'index'): EditIndexParamResult {
  const params = useParams();
  const rawParam = params[paramName];

  const hasIndexParam = typeof rawParam === 'string';
  const editIndex = useMemo(() => parseIndexParam(rawParam), [rawParam]);
  const invalidIndexParam = hasIndexParam && editIndex === null;

  return {
    hasIndexParam,
    editIndex,
    invalidIndexParam,
  };
}

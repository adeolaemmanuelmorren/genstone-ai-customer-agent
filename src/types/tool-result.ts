export interface ToolResult<TData = Record<string, unknown>> {
  ok: boolean;
  result_code: string;
  safe_summary: string;
  data?: TData;
}

export function successResult<TData>(
  resultCode: string,
  safeSummary: string,
  data?: TData,
): ToolResult<TData> {
  return {
    ok: true,
    result_code: resultCode,
    safe_summary: safeSummary,
    ...(data === undefined ? {} : { data }),
  };
}

export function failureResult(
  resultCode: string,
  safeSummary: string,
): ToolResult {
  return {
    ok: false,
    result_code: resultCode,
    safe_summary: safeSummary,
  };
}

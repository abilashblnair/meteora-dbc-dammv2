export function explainError(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    const withLogs = error as Error & { logs?: string[]; getLogs?: () => string[] | Promise<string[]> };
    const logs = Array.isArray(withLogs.logs) ? withLogs.logs : undefined;
    const tail = logs?.slice(-8).join("\n");
    return tail ? `${error.message}\n${tail}` : error.message;
  }
  return String(error);
}

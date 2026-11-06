// Shared only by synthetic Git fixtures. This ships beside the improve fixture
// because the installed CLI's selftest uses it too. Never include environment
// variables or Git configuration in a diagnostic.
const bounded = (value, limit) => {
  const text = String(value ?? '');
  if (text.length <= limit) return text;
  const half = Math.floor(limit / 2);
  return `${text.slice(0, half)}\n[truncated ${text.length - 2 * half} characters]\n${text.slice(-half)}`;
};

/** Retain both ends of Git's output, including when spawn failed or timed out. */
export function gitFailure(args, result, cwd) {
  return [
    `synthetic Git: ${bounded(JSON.stringify(['git', ...args]), 2048)}`,
    `cwd: ${bounded(cwd, 1024)}`,
    `status: ${result.status ?? 'null'}; signal: ${result.signal ?? 'null'}`,
    `error: ${bounded(result.error ? `${result.error.code ?? 'unknown'}: ${result.error.message}` : 'none', 1024)}`,
    `stderr:\n${bounded(result.stderr, 4096) || '(empty)'}`,
    `stdout:\n${bounded(result.stdout, 4096) || '(empty)'}`,
  ].join('\n');
}

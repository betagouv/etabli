export function areMocksGloballyEnabled(): boolean {
  return process.env.ENABLE_MOCKS === 'true';
}

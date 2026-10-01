export class ProviderError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'ProviderError';
    this.code = code;
  }
}

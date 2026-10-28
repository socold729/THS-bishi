export class ReportError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

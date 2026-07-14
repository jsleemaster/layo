export interface AccountTokenOperationContext<TSession> {
  generation: number;
  identity: string;
  session: TSession;
}

export function isCurrentAccountTokenOperation<TSession>(
  operation: AccountTokenOperationContext<TSession>,
  current: AccountTokenOperationContext<TSession>
): boolean {
  return operation.generation === current.generation
    && operation.identity === current.identity;
}

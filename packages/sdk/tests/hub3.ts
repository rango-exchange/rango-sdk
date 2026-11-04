// hub3's error as a second install of hub3 throws it: the same name and type, but not `instanceof` the imported one.
export class SecondCopyHub3Error extends Error {
  override readonly name = 'Hub3Error'
  readonly type = 'PROVIDER_USER_REJECTED_REQUEST'
}

export function identity(value: unknown): unknown {
  return value
}

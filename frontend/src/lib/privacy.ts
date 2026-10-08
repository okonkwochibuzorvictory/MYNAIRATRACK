export const BALANCE_MASK = '••••••••'

export const DEFAULT_BALANCE_VISIBLE = false

export function displayBalance(text: string, visible: boolean): string {
  return visible ? text : BALANCE_MASK
}

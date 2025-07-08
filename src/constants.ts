export const ERRORS = ['action="estimateGas"', "Execution reverted for an unknown reason", "EstimateGasExecutionError"]
export const NONCE_USED_ERROR = ["Try increasing the nonce", "nonce has already been used"]
export let CONFIG = {
  log: console.debug,
  MAX_TRY: 4,
} as {
  log: Function
  redis?: Record<string, string | number>
  MAX_TRY?: number
}

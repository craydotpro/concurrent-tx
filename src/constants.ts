export const ERRORS = ['action="estimateGas"', "reverted", "EstimateGasExecutionError"]
export const INVALID_NONCE_ERROR = ["Try increasing the nonce", "nonce has already been used", "underpriced"]

export let CONFIG = {
  logger: console.debug,
  log: (...props) => {
    CONFIG.logger(...props)
  },
  MAX_TRY: 4,
} as {
  logger: (...props) => {}
  log: (...payload: any) => {}
  MAX_TRY?: number
}

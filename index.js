import { createPublicClient, http } from "viem"
import { initRedis } from "./redis"
import nonceManager from "./nonce_manager"

export const _sleep = (ms) => new Promise((resolve) => setTimeout(() => resolve(true), ms))
const ERRORS = ['action="estimateGas"']
let log = console.debug
export const executeContract = async (wallet, { to, data, value, chainId, gasPrice, nonce }) => {
  try {
    nonce = nonce || (await nonceManager.GetNextNonce(chainId))
    const tx = {
      to: to,
      value: value,
      data,
      nonce: nonce,
      ...(gasPrice && { gasPrice }),
    }
    const response = await wallet.sendTransaction(tx)
    let res = await response.wait()
    if (response.data === "0x") {
      /** if empty transaction */
      return Promise.reject("Transaction Failed")
    }
    return res
  } catch (error) {
    await _sleep(1000)
    log(`tx Failed chainId: ${chainId}, nonce: ${nonce}`, error)
    if (ERRORS.some((error) => String(error).includes(error))) {
      /** try zero tx if failed with valid reason */
      return executeContract({
        to: wallet.address,
        value: 0,
        chainId,
        nonce,
      })
    }
    return executeContract({ to, data, value, chainId, gasPrice, nonce })
  }
}

export const initTxRetry = async ({ chains = [], walletAddress, redisConfig, errors, logger }) => {
  chains.forEach(async (chain) => {
    try {
      if (logger) {
        log = logger
      }
      if (errors) {
        Object.assign(ERRORS, errors)
      }
      if (redisConfig) {
        const redisClient = await initRedis(redisConfig)
        nonceManager.SetRedisClient(redisClient)
      }
      const publicClient = createPublicClient({
        chain: chain,
        transport: http(),
      })

      let pendingNonce = await publicClient.getTransactionCount({ address: walletAddress, blockTag: "pending" })
      pendingNonce--
      nonceManager.InitNonce(chainId, pendingNonce)
    } catch (error) {
      log(error)
    }
  })
}

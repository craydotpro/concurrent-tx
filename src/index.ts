import { Hex, PublicClient, WalletClient } from "viem"
import { _sleep, waitUntil } from "./utils"
import { ERRORS, INVALID_NONCE_ERROR } from "./constants"
const getKey = (address, chainId) => `nonce:${address.toLowerCase()}:${chainId}`
const BACKOFF_TIMEOUT = {
  1: 10_000,
  2: 10_000,
  3: 10_000,
  4: 10_000,
}
class ConcurrentTx {
  log = null
  MAX_TRY = null
  isNonceInitialized = new Map()
  isNonceInitializtionLoading = new Map()
  nonce = new Map()
  constructor({ MAX_TRY }: { MAX_TRY?: number } = {}) {
    this.MAX_TRY = MAX_TRY || 4
  }
  _increaseMaxPriorityFeePerGas = async ({ tx, publicClient, tryCount, logger }: any) => {
    const currentMaxPriorityFeePerGas = Number(await publicClient.estimateMaxPriorityFeePerGas())
    if (!tx.maxPriorityFeePerGas) {
      tx.maxPriorityFeePerGas = currentMaxPriorityFeePerGas
    } else if (tryCount !== 0) {
      /** increase maxPriorityFeePerGas by 15% if retrying */
      logger("Increasing maxPriorityFeePerGas by 15%, nonce:", tx.nonce)
      tx.maxPriorityFeePerGas = Number(tx.maxPriorityFeePerGas)
      tx.maxPriorityFeePerGas = Math.max(tx.maxPriorityFeePerGas + (tx.maxPriorityFeePerGas * 15) / 100, currentMaxPriorityFeePerGas)
    }
    tx.maxPriorityFeePerGas = BigInt(parseInt(tx.maxPriorityFeePerGas))
  }
  private _send = async (props: { walletClient?: WalletClient; publicClient?: PublicClient<any, any, any>; tx: any; tryCount: number; txHash?: string; emptyTx?: boolean; logger: Function }) => {
    const { walletClient, publicClient, tx, emptyTx, logger } = props
    let { txHash, tryCount } = props
    const chainId = publicClient.chain.id
    let walletAddress = walletClient?.account?.address?.toLowerCase() || tx.account?.address?.toLowerCase()

    if (tryCount > this.MAX_TRY) {
      logger("Transaction Failed More than Max Try")
      return Promise.reject("Transaction Failed More than Max Try")
    }
    logger(`Trying nonce: ${tx.nonce}, tryCount ${tryCount}. nonce Type ${typeof tx.nonce}`)
    try {
      await this._increaseMaxPriorityFeePerGas(props)
      if (!txHash) txHash = await walletClient.sendTransaction(tx)

      let res = await publicClient.waitForTransactionReceipt({
        hash: txHash as Hex,
        timeout: 2 * 60_000,
      })
      if (res.status !== "success") return Promise.reject(res) /** reverted */
      if (emptyTx) {
        logger("Transaction dropped")
        return Promise.reject("Transaction dropped")
      } else {
        return res
      }
    } catch (error) {
      console.log(`concurrent-tx error: ${tx.nonce}`, error)
      if (!String(error).includes("Too Many Requests")) tryCount++ /** if not RPC ratelimit Error */
      else logger(`RPC Error at nonce: ${tx.nonce}`, String(error))
      await _sleep(BACKOFF_TIMEOUT[tryCount] || 2000)
      if (ERRORS.some((errorString) => String(error).includes(errorString))) {
        const currentNonce = await this.GetCurrentNonce({ walletAddress, chainId })
        if (tx.nonce === currentNonce) {
          /** if no other transaction in the queue */
          logger("Tx Failed, and nonce free", tx.nonce)
          await this.DecreaseNonce({ walletAddress, chainId })
          return Promise.reject("Transaction Failed")
        } else {
          logger("Tx Dropped at nonce:", tx.nonce)
          /** try zero tx if failed with valid reason */
          const emptyTx = { to: tx.account.address, nonce: tx.nonce, value: 0, account: tx.account }
          return this._send({ ...props, tx: emptyTx, emptyTx: true })
        }
      }
      if (INVALID_NONCE_ERROR.some((errorString) => String(error).includes(errorString))) {
        const key = getKey(walletAddress, chainId)
        const pending = await publicClient.getTransactionCount({ address: walletAddress as Hex, blockTag: "latest" })
        await this.nonce.set(key, pending - 1)
        tx.nonce = pending
        return this._send({ ...props, tx, tryCount, txHash })
      }
      if (String(error).includes("Timed out while waiting for transaction")) {
        /** most probably transaction waiting in the mempool */
        txHash = ""
      }
      return this._send({ ...props, tx, tryCount, txHash })
    }
  }
  InitNonce = async ({ walletAddress, publicClient }) => {
    const chainId = publicClient.chain.id
    const key = getKey(walletAddress, chainId)

    if (this.isNonceInitializtionLoading.get(key)) await waitUntil(() => !this.isNonceInitializtionLoading.get(key))
    if (this.isNonceInitialized.get(key)) return /** if alreay nonce initialized return */

    this.isNonceInitializtionLoading.set(key, true)

    let latestNonce = await publicClient.getTransactionCount({ address: walletAddress, blockTag: "latest" })
    this.nonce.set(key, latestNonce - 1)
    this.isNonceInitialized.set(key, true)
    this.isNonceInitializtionLoading.set(key, false)
  }
  GetNextNonce = ({ walletAddress, chainId }) => {
    const key = getKey(walletAddress, chainId)
    let nonce = this.nonce.get(key)
    this.nonce.set(key, nonce + 1)
    return nonce + 1
  }

  GetCurrentNonce = ({ walletAddress, chainId }) => {
    const key = getKey(walletAddress, chainId)
    return this.nonce.get(key)
  }
  DecreaseNonce = ({ walletAddress, chainId }) => {
    const key = getKey(walletAddress, chainId)
    let prevNonce = this.nonce.get(key) - 1
    this.nonce.set(key, prevNonce)
    return prevNonce
  }

  Send = async (props: { walletClient?: WalletClient; publicClient?: PublicClient<any, any, any>; tx: any; logger?: Function }) => {
    const { walletClient, publicClient, tx, logger = console.debug } = props
    const chainId = publicClient.chain.id
    let walletAddress = walletClient?.account?.address?.toLowerCase() || tx.account?.address?.toLowerCase()
    await this.InitNonce({ walletAddress, publicClient })
    tx.nonce = this.GetNextNonce({ walletAddress, chainId })
    return this._send({ walletClient, publicClient, tx, tryCount: 0, logger })
  }
}
export default ConcurrentTx
process.on("uncaughtException", function (error) {
  const erros = ["Too Many Requests", "Transaction Failed"]
  if (!erros.some((_) => String(error).includes(_))) {
    throw error
  }
})

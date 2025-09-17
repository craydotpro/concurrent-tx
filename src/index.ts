import { PublicClient, WalletClient } from "viem"
import { CONFIG } from "./constants"
import "./transaction"
import { Wallet } from "ethers"
import transaction from "./transaction"

export const sendTransaction = ({
  walletClient,
  publicClient,
  chainId,
  options,
  tx,
}: {
  walletClient?: WalletClient
  publicClient?: PublicClient<any, any, any>
  chainId: number
  options?: Record<string, any>
  tx: Record<string, string | number>
}) => {
  if (options) {
    Object.assign(CONFIG, options)
  }
  return transaction.sendTransaction({ walletClient, publicClient, chainId, tx })
}
process.on("uncaughtException", function (error) {
  if (!String(error).includes("Too Many Requests")) {
    throw error
  }
})

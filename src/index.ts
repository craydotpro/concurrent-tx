import { PublicClient, WalletClient } from "viem"
import { CONFIG } from "./constants"
import "./transaction"
import { Wallet } from "ethers"
import transaction from "./transaction"

export const sendTransaction = ({
  wallet,
  walletClient,
  publicClient,
  chainId,
  options,
  tx,
}: {
  wallet?: Wallet
  walletClient?: WalletClient
  publicClient?: PublicClient<any, any, any>
  chainId: number
  options?: Record<string, any>
  tx: Record<string, string | number>
}) => {
  if (options) {
    Object.assign(CONFIG, options)
  }
  return transaction.sendTransaction({ wallet, walletClient, publicClient, chainId, tx })
}

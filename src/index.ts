import { createPublicClient, createWalletClient, http, PublicClient, WalletClient } from "viem"
import * as CHAINS from "viem/chains"
import { privateKeyToAccount } from "viem/accounts"
import { CONFIG } from "./constants"
import "./transaction"
import { JsonRpcProvider, Wallet } from "ethers"
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

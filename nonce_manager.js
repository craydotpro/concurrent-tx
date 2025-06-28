class NonceManager {
  redisClient = null
  memoryStorage = new Map()
  SetRedisClient = (r) => {
    this.redisClient = r
  }

  InitNonce = (chainId, nonce) => {
    const key = `nonce:${chainId}`
    if (this.redisClient) {
      r.SET(key, nonce)
    } else {
      this.memoryStorage.set(key, nonce)
    }
  }
  GetNextNonce = async (chainId) => {
    const key = `nonce:${chainId}`
    if (this.redisClient) {
      return r.incr(key, 1)
    } else {
      let nextNonce = this.memoryStorage.get(key) + 1
      this.memoryStorage.set(key, nextNonce)
      return nextNonce
    }
  }
}
const nonceManager = new NonceManager()
export default nonceManager

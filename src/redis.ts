import { createClient } from "redis"

export let redisClient
export const initRedis = async (config) => {
  redisClient = await createClient(config)
    .on("error", (err) => console.log("Redis Client Error in tx-retry", err))
    .connect()
  return redisClient
}

// lib/kv-client.js
import { Redis } from '@upstash/redis';

// Upstash Redis クライアント初期化
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// Vercel KV 互換APIラッパー
export const kv = {
  async get(key) {
    try {
      return await redis.get(key);
    } catch (error) {
      console.error('[KV] Get error:', error);
      throw error;
    }
  },
  
  async set(key, value) {
    try {
      return await redis.set(key, value);
    } catch (error) {
      console.error('[KV] Set error:', error);
      throw error;
    }
  },
  
  async del(key) {
    try {
      return await redis.del(key);
    } catch (error) {
      console.error('[KV] Del error:', error);
      throw error;
    }
  },
  
  async expire(key, seconds) {
    try {
      return await redis.expire(key, seconds);
    } catch (error) {
      console.error('[KV] Expire error:', error);
      throw error;
    }
  },
  
  async incr(key) {
    try {
      return await redis.incr(key);
    } catch (error) {
      console.error('[KV] Incr error:', error);
      throw error;
    }
  },
  
  async incrby(key, increment) {
    try {
      return await redis.incrby(key, increment);
    } catch (error) {
      console.error('[KV] Incrby error:', error);
      throw error;
    }
  },
  
  async keys(pattern) {
    try {
      return await redis.keys(pattern);
    } catch (error) {
      console.error('[KV] Keys error:', error);
      throw error;
    }
  },
};
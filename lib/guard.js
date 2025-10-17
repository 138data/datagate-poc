import { kv } from '@vercel/kv';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

async function checkRateLimit(key, cap, ttl) {
  try {
    const rateLimitKey = `ratelimit:${key}`;
    const current = await kv.get(rateLimitKey);
    const count = current ? parseInt(current) : 0;

    if (count >= cap) {
      const ttlRemaining = await kv.ttl(rateLimitKey);
      return { allowed: false, remaining: 0, resetTime: Date.now() + (ttlRemaining * 1000) };
    }

    if (count === 0) {
      await kv.set(rateLimitKey, 1, { ex: ttl });
    } else {
      await kv.incr(rateLimitKey);
    }

    return { allowed: true, remaining: cap - count - 1, resetTime: Date.now() + (ttl * 1000) };
  } catch (error) {
    console.error('Rate limit error:', error);
    return { allowed: true, remaining: cap, resetTime: Date.now() + (ttl * 1000) };
  }
}

function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { valid: true, user: decoded };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

export function withGuard(handler, options = {}) {
  const { route = '/api/unknown', requireAuth = false, checkIP = false, rateLimit = false, cap = 100, ttl = 3600, logAccess = true } = options;

  return async (req, res) => {
    try {
      const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
      
      if (logAccess) {
        console.log(`${req.method} ${route} from ${ip}`);
      }

      if (requireAuth) {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Authorization required' });
        }

        const token = authHeader.substring(7);
        const { valid, user, error } = verifyToken(token);

        if (!valid) {
          console.error('Token verification failed:', error);
          return res.status(401).json({ error: 'Invalid or expired token' });
        }

        req.user = user;
        console.log('Token verified. User:', user.username);
      }

      if (rateLimit) {
        const rateLimitKey = `${ip}:${route}`;
        const rateLimitResult = await checkRateLimit(rateLimitKey, cap, ttl);

        res.setHeader('X-RateLimit-Limit', cap);
        res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
        res.setHeader('X-RateLimit-Reset', rateLimitResult.resetTime);

        if (!rateLimitResult.allowed) {
          console.warn(`Rate limit exceeded for ${ip} on ${route}`);
          return res.status(429).json({ error: 'Too many requests', retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000) });
        }
      }

      return await handler(req, res);

    } catch (error) {
      console.error('Guard middleware error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}
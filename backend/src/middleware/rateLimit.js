// Simple in-memory rate limiter (no external dependency)
const store = new Map();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);

export const rateLimit = (maxRequests = 60, windowMs = 60000) => (req, res, next) => {
  const key = req.ip + ':' + req.baseUrl;
  const now = Date.now();
  let entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
  }

  entry.count++;
  store.set(key, entry);

  res.setHeader('X-RateLimit-Limit', maxRequests);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count));

  if (entry.count > maxRequests) {
    return res.status(429).json({ error: 'Too many requests, try again later' });
  }

  next();
};

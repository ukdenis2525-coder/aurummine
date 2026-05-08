import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/init', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

export default router;

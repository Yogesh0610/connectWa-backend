import express from 'express';
import { authenticate } from '../middlewares/auth.js';

import {
  getLinkedInAuthUrl,
  handleLinkedInCallback,
  getTwitterAuthUrl,
  handleTwitterCallback,
  getAccounts,
  disconnectAccount,
  refreshLinkedInAccount,
} from '../controllers/social-account.controller.js';

import {
  createPost,
  getPosts,
  getPost,
  updatePost,
  publishPost,
  refreshAnalytics,
  deletePost,
  retryPost,
  getAnalytics,
  bulkSchedule,
  upload,
} from '../controllers/social-post.controller.js';

const router = express.Router();

// ── OAuth Callbacks (public — no auth) ───────────────────────────────────────
router.get('/linkedin/callback', handleLinkedInCallback);
router.get('/twitter/callback',  handleTwitterCallback);

// ── All other routes require auth ─────────────────────────────────────────────
router.use(authenticate);

// ── Account management ────────────────────────────────────────────────────────
router.get('/accounts',                   getAccounts);
router.get('/linkedin/auth-url',          getLinkedInAuthUrl);
router.get('/twitter/auth-url',           getTwitterAuthUrl);
router.delete('/accounts/:id',            disconnectAccount);
router.post('/accounts/:id/refresh',      refreshLinkedInAccount);

// ── Analytics dashboard ───────────────────────────────────────────────────────
router.get('/analytics',                  getAnalytics);

// ── Posts ─────────────────────────────────────────────────────────────────────
router.get('/posts',                             getPosts);
router.post('/posts', upload.array('media', 10), createPost);
router.post('/posts/bulk-schedule',              bulkSchedule);
router.get('/posts/:id',                         getPost);
router.patch('/posts/:id', upload.array('media', 10), updatePost);
router.post('/posts/:id/publish',                publishPost);
router.post('/posts/:id/retry',                  retryPost);
router.post('/posts/:id/analytics',              refreshAnalytics);
router.delete('/posts/:id',                      deletePost);

export default router;

import { SocialPost }    from '../models/SocialPost.js';
import { SocialAccount } from '../models/SocialAccount.js';
import { socialPostService } from '../services/social/social-post.service.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '..', 'uploads', 'social');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

export const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename:    (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    const allowed = /image\/(jpeg|png|gif|webp)|video\/(mp4|mov)/;
    cb(null, allowed.test(file.mimetype));
  },
});

// ── Create / Draft Post ───────────────────────────────────────────────────────

export const createPost = async (req, res) => {
  try {
    const {
      title, content, link_url, link_title, link_description,
      hashtags, targets, scheduled_at,
    } = req.body;

    if (!content?.trim()) return res.status(400).json({ success: false, message: 'Content is required' });
    if (!targets?.length) return res.status(400).json({ success: false, message: 'At least one target account is required' });

    const parsedTargets = typeof targets === 'string' ? JSON.parse(targets) : targets;
    const parsedHashtags = typeof hashtags === 'string' ? JSON.parse(hashtags) : (hashtags || []);

    // Validate targets belong to this user
    for (const t of parsedTargets) {
      const acc = await SocialAccount.findOne({ _id: t.social_account_id, user_id: req.user._id, is_active: true });
      if (!acc) return res.status(400).json({ success: false, message: `Invalid account: ${t.social_account_id}` });
    }

    // Attach uploaded media
    const media = (req.files || []).map(f => ({
      type:              f.mimetype.startsWith('video') ? 'video' : 'image',
      url:               `${process.env.BACKEND_URL}/uploads/social/${f.filename}`,
      original_filename: f.originalname,
    }));

    const status = scheduled_at ? 'scheduled' : 'draft';

    const post = await SocialPost.create({
      user_id:          req.user._id,
      title,
      content,
      link_url,
      link_title,
      link_description,
      hashtags:         parsedHashtags,
      media,
      targets:          parsedTargets,
      status,
      scheduled_at:     scheduled_at || null,
    });

    res.status(201).json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Get Posts ─────────────────────────────────────────────────────────────────

export const getPosts = async (req, res) => {
  try {
    const { status, platform, page = 1, limit = 20 } = req.query;
    const filter = { user_id: req.user._id, deleted_at: null };
    if (status)   filter.status = status;
    if (platform) filter['targets.platform'] = platform;

    const skip = (page - 1) * limit;
    const [posts, total] = await Promise.all([
      SocialPost.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      SocialPost.countDocuments(filter),
    ]);

    res.json({ success: true, data: posts, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Get Single Post ────────────────────────────────────────────────────────────

export const getPost = async (req, res) => {
  try {
    const post = await SocialPost.findOne({ _id: req.params.id, user_id: req.user._id, deleted_at: null });
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Update Post (draft / rescheduled only) ────────────────────────────────────

export const updatePost = async (req, res) => {
  try {
    const post = await SocialPost.findOne({ _id: req.params.id, user_id: req.user._id });
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    if (['published', 'publishing'].includes(post.status)) {
      return res.status(400).json({ success: false, message: 'Cannot edit a published post' });
    }

    const { title, content, link_url, link_title, link_description, hashtags, targets, scheduled_at } = req.body;
    if (title !== undefined)            post.title            = title;
    if (content !== undefined)          post.content          = content;
    if (link_url !== undefined)         post.link_url         = link_url;
    if (link_title !== undefined)       post.link_title       = link_title;
    if (link_description !== undefined) post.link_description = link_description;
    if (hashtags !== undefined)         post.hashtags         = typeof hashtags === 'string' ? JSON.parse(hashtags) : hashtags;
    if (targets !== undefined)          post.targets          = typeof targets  === 'string' ? JSON.parse(targets)  : targets;
    if (scheduled_at !== undefined)     post.scheduled_at     = scheduled_at || null;

    post.status = post.scheduled_at ? 'scheduled' : 'draft';
    await post.save();
    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Publish Now ───────────────────────────────────────────────────────────────

export const publishPost = async (req, res) => {
  try {
    const post = await SocialPost.findOne({ _id: req.params.id, user_id: req.user._id });
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    const result = await socialPostService.publishNow(post._id);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Refresh Analytics ──────────────────────────────────────────────────────────

export const refreshAnalytics = async (req, res) => {
  try {
    const post = await SocialPost.findOne({ _id: req.params.id, user_id: req.user._id });
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    const result = await socialPostService.refreshAnalytics(post._id);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Delete Post ───────────────────────────────────────────────────────────────

export const deletePost = async (req, res) => {
  try {
    const post = await SocialPost.findOne({ _id: req.params.id, user_id: req.user._id });
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    post.deleted_at = new Date();
    await post.save();
    res.json({ success: true, message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

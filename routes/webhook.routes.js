import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import Webhook from '../models/webhook.model.js';

const router = express.Router();

router.use(authenticate);

// GET /webhooks/list
router.get('/list', async (req, res) => {
  try {
    const webhooks = await Webhook.find({ user_id: req.user._id }).sort({ created_at: -1 });
    res.json({ success: true, data: webhooks });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /webhooks/:id
router.get('/:id', async (req, res) => {
  try {
    const webhook = await Webhook.findOne({ _id: req.params.id, user_id: req.user._id });
    if (!webhook) return res.status(404).json({ success: false, message: 'Webhook not found' });
    res.json({ success: true, data: webhook });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /webhooks
router.post('/', async (req, res) => {
  try {
    const token = Webhook.generateWebhookToken();
    const webhook = await Webhook.create({
      user_id: req.user._id,
      webhook_name: req.body.webhook_name,
      webhook_token: token,
      description: req.body.description,
      platform: req.body.platform || 'custom',
      event_type: req.body.event_type,
    });
    res.status(201).json({ success: true, data: webhook });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PUT /webhooks/:id
router.put('/:id', async (req, res) => {
  try {
    const webhook = await Webhook.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user._id },
      { ...req.body, updated_at: new Date() },
      { new: true }
    );
    if (!webhook) return res.status(404).json({ success: false, message: 'Webhook not found' });
    res.json({ success: true, data: webhook });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /webhooks/:id
router.delete('/:id', async (req, res) => {
  try {
    const webhook = await Webhook.findOneAndDelete({ _id: req.params.id, user_id: req.user._id });
    if (!webhook) return res.status(404).json({ success: false, message: 'Webhook not found' });
    res.json({ success: true, message: 'Webhook deleted' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PATCH /webhooks/:id/toggle
router.patch('/:id/toggle', async (req, res) => {
  try {
    const webhook = await Webhook.findOne({ _id: req.params.id, user_id: req.user._id });
    if (!webhook) return res.status(404).json({ success: false, message: 'Webhook not found' });
    webhook.config.is_active = !webhook.config.is_active;
    webhook.updated_at = new Date();
    await webhook.save();
    res.json({ success: true, data: webhook });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /webhooks/:id/map-template
router.post('/:id/map-template', async (req, res) => {
  try {
    const webhook = await Webhook.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user._id },
      {
        template_id: req.body.template_id,
        field_mapping: req.body.field_mapping,
        is_template_mapped: true,
        updated_at: new Date(),
      },
      { new: true }
    );
    if (!webhook) return res.status(404).json({ success: false, message: 'Webhook not found' });
    res.json({ success: true, data: webhook });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

export default router;

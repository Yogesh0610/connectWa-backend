import express from 'express';
import chatbotController from '../controllers/chatbot.controller.js';
import { authenticate , authorizeRoles } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);

// Static routes MUST come before /:id param route
router.post('/scrape', checkPermission('create.chatbots'), async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, message: 'URL is required' });
    const axios = (await import('axios')).default;
    const response = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = String(response.data);
    // Strip HTML tags to get plain text
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 10000);
    return res.json({ success: true, data: { text } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/extract-doc', checkPermission('create.chatbots'), async (req, res) => {
  try {
    // Basic stub — returns empty text if no file processing library available
    return res.json({ success: true, data: { text: '' } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/', checkPermission('view.chatbots'), chatbotController.getAllChatbots);
router.post('/', checkPermission('create.chatbots'), chatbotController.createChatbot);
router.get('/:id', checkPermission('view.chatbots'), chatbotController.getChatbotById);
router.put('/:id', checkPermission('update.chatbots'), chatbotController.updateChatbot);
router.delete('/:id', checkPermission('delete.chatbots'), chatbotController.deleteChatbot);
router.post('/:id/train', checkPermission('update.chatbots'), chatbotController.trainChatbot);

export default router;

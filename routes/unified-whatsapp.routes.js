import express from 'express';
import unifiedWhatsAppController from '../controllers/unified-whatsapp.controller.js';
import { authenticate, authorizeRoles } from '../middlewares/auth.js';
import { uploadSingle } from '../utils/upload.js';
import multer from "multer";
import { checkPermission } from '../middlewares/permission.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 16 * 1024 * 1024
  }
});

const router = express.Router();

router.post('/send', authenticate, upload.single('file_url'), checkPermission('create.unified_whatsapp'), unifiedWhatsAppController.sendMessage);
router.get('/messages', authenticate, checkPermission('view.unified_whatsapp'), unifiedWhatsAppController.getMessages);
router.get('/chats', authenticate, checkPermission('view.unified_whatsapp'), unifiedWhatsAppController.getRecentChats);
router.post('/pin-chat', authenticate, checkPermission('update.unified_whatsapp'), unifiedWhatsAppController.togglePinChat);
router.post('/assign-chat', authenticate, checkPermission('create.agents'), unifiedWhatsAppController.assignChatToAgent);
router.get('/status', authenticate, checkPermission('view.unified_whatsapp'), unifiedWhatsAppController.getConnectionStatus);
router.post('/connect', authenticate, checkPermission('create.unified_whatsapp'), unifiedWhatsAppController.connectWhatsApp);
router.get('/baileys/qrcode/:wabaId', authenticate, checkPermission('view.unified_whatsapp'), unifiedWhatsAppController.getBaileysQRCode);
router.put('/connect/:id', authenticate, checkPermission('update.unified_whatsapp'), unifiedWhatsAppController.updateConnection);
router.post('/delete', authenticate, checkPermission('delete.unified_whatsapp'), unifiedWhatsAppController.deleteConnections);
router.get('/connections', authenticate, checkPermission('view.unified_whatsapp'), unifiedWhatsAppController.getUserConnections);
router.get('/phone-numbers', authenticate, checkPermission('view.unified_whatsapp'), unifiedWhatsAppController.getMyPhoneNumbers);
router.put('/phone-numbers/:phoneNumberId/set-primary', authenticate, checkPermission('update.unified_whatsapp'), unifiedWhatsAppController.setPrimaryPhoneNumber);
router.get('/:wabaId/phone-numbers', authenticate, checkPermission('view.unified_whatsapp'), unifiedWhatsAppController.getWabaPhoneNumbers);
router.get('/:wabaId', authenticate, checkPermission('view.unified_whatsapp'), async (req, res) => {
  try {
    const { WhatsappWaba } = await import('../models/index.js');
    const waba = await WhatsappWaba.findOne({ _id: req.params.wabaId, user_id: req.user._id, deleted_at: null }).lean();
    if (!waba) return res.status(404).json({ success: false, message: 'Connection not found' });
    res.json({ success: true, data: waba });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
router.post('/embedded-signup/connection', authenticate, checkPermission('create.unified_whatsapp'), unifiedWhatsAppController.getEmbbededSignupConnection);
router.get('/contact-profile', authenticate, checkPermission('view.unified_whatsapp'), unifiedWhatsAppController.getContactProfile);
export default router;

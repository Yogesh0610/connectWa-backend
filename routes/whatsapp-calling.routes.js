import express from 'express';
import whatsappCallingController from '../controllers/whatsapp-calling.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.get('/settings', authenticate, checkPermission('view.whatsapp_calling'), whatsappCallingController.getCallSettings);
router.post('/settings', authenticate, checkPermission('update.whatsapp_calling'), whatsappCallingController.updateCallSettings);

router.get('/agents', authenticate, checkPermission('view.whatsapp_calling'), whatsappCallingController.getCallAgents);
router.get('/agents/:id', authenticate, whatsappCallingController.getCallAgentById);
router.post('/agents', authenticate, checkPermission('create.whatsapp_calling'), whatsappCallingController.createCallAgent);
router.put('/agents/:id', authenticate, checkPermission('update.whatsapp_calling'), whatsappCallingController.updateCallAgent);
router.delete('/agents', authenticate, checkPermission('delete.whatsapp_calling'), whatsappCallingController.deleteCallAgent);

router.post('/assign-agent', authenticate, checkPermission('create.whatsapp_calling'), whatsappCallingController.assignAgentToContact);
router.post('/assign-agent-bulk', authenticate, checkPermission('create.whatsapp_calling'), whatsappCallingController.assignAgentBulk);
router.delete('/remove-agent/:contact_id', authenticate, checkPermission('delete.whatsapp_calling'), whatsappCallingController.removeAgentFromContact);
router.post('/remove-agent-bulk', authenticate, checkPermission('delete.whatsapp_calling'), whatsappCallingController.removeAgentBulk);

router.post('/human/answer', authenticate, whatsappCallingController.humanAnswerCall);
router.post('/human/reject', authenticate, whatsappCallingController.humanRejectCall);

router.get('/logs', authenticate, checkPermission('view.whatsapp_calling'), whatsappCallingController.getCallLogs);
router.get('/logs/:id', authenticate, checkPermission('view.whatsapp_calling'), whatsappCallingController.getCallLogById);
router.get('/logs/:id/transcription', authenticate, checkPermission('view.whatsapp_calling'), whatsappCallingController.getCallTranscription);
router.delete('/logs/bulk-delete', authenticate, checkPermission('delete.whatsapp_calling'), whatsappCallingController.bulkDeleteCallLogs);

export default router;

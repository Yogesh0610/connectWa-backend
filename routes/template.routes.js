import express from 'express';
import { authenticate, authorizeRoles } from '../middlewares/auth.js';
import { requireSubscription, checkPlanLimit } from '../middlewares/plan-permission.js';
import templateController from '../controllers/template.controller.js';
import { checkPermission } from '../middlewares/permission.js';
import multer from "multer";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 16 * 1024 * 1024
  }
});

router.use(authenticate);
router.use(requireSubscription);

// Static routes MUST come before /:id param routes
router.get('/meta-list', checkPermission('view.template'), templateController.getTemplatesFromMeta);
router.get('/admin-templates/list', checkPermission('view.template'), templateController.getAdminTemplatesForUsers);
router.post('/sync', checkPermission('update.template'), templateController.syncTemplatesFromMeta);
router.post('/sync-status', checkPermission('update.template'), templateController.syncTemplatesStatusFromMeta);
router.post('/suggest', checkPlanLimit('ai_prompts'), checkPermission('create.ai_prompts'), checkPermission('create.template'), templateController.suggestTemplate);
// POST / (frontend) and POST /create (older clients) both create
router.post('/', checkPlanLimit('template_bots'), upload.fields([{ name: 'file', maxCount: 1 }, { name: 'card_media', maxCount: 10 }]), checkPermission('create.template'), templateController.createTemplate);
router.post('/create', checkPlanLimit('template_bots'), upload.fields([{ name: 'file', maxCount: 1 }, { name: 'card_media', maxCount: 10 }]), checkPermission('create.template'), templateController.createTemplate);

router.get('/', checkPermission('view.template'), templateController.getAllTemplates);
router.get('/:id', checkPermission('view.template'), templateController.getTemplateById);
router.put('/:id', checkPermission('update.template'), templateController.updateTemplate);
router.delete('/:id', checkPermission('delete.template'), templateController.deleteTemplate);

export default router;

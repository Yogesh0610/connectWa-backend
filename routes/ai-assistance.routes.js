import express from 'express';
import { transformMessage, suggestReply, getSupportedLanguages } from '../controllers/ai-assistance.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPlanLimit } from '../middlewares/plan-permission.js'
import { checkPermission } from '../middlewares/permission.js';
const router = express.Router();


router.post('/transform', authenticate, checkPlanLimit('ai_prompts'), checkPermission('create.ai_prompts'), transformMessage);
router.post('/suggest-reply', authenticate, checkPlanLimit('ai_prompts'), checkPermission('create.ai_prompts'), suggestReply);

router.get('/languages', authenticate, checkPermission('view.languages'), getSupportedLanguages);

export default router;

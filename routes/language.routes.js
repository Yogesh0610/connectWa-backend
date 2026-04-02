import express from 'express';
import * as languageController from '../controllers/language.controller.js';
import { authenticate, authorizeAdmin } from '../middlewares/auth.js';
import { uploader } from '../utils/upload.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.get('/', languageController.getLanguages);


const languageUploadFields = [
    { name: 'translation_json', maxCount: 1 },
    { name: 'flag', maxCount: 1 }
];

router.post('/create',authenticate, uploader('languages').fields(languageUploadFields), checkPermission('create.languages'), languageController.createLanguage);
router.get('/:id', checkPermission('view.languages'), languageController.getLanguageById);
router.put('/:id',authenticate, uploader('languages').fields(languageUploadFields), checkPermission('update.languages'), languageController.updateLanguage);
router.delete('/delete',authenticate, checkPermission('delete.languages'), languageController.deleteLanguages);
router.patch('/:id/toggle-status',authenticate, checkPermission('update.languages'), languageController.toggleLanguageStatus);

router.get('/translations/:id',  languageController.getTranslations);
router.put('/translations/:id',authenticate, checkPermission('update.languages'), languageController.updateTranslations);
router.patch('/:id/toggle-default',authenticate, checkPermission('update.languages'), languageController.toggleDefaultLanguage);

export default router;

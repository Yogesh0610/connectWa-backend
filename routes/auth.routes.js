import express from 'express';
import authController from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);

router.post('/verify-otp', authController.verifyOTP);
router.post('/resend-otp', authController.resendOTP);

router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

router.post('/logout', authenticate, authController.logout);
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, authController.updateProfile);
router.get('/roles', authController.getPublicRoles);
router.get('/my-permissions', authenticate, authController.getMyPermissions);
router.post('/change-password', authenticate, authController.changePassword);

// refresh-db disabled in production — was exposing hardcoded DB credentials
router.get('/refresh-db', (req, res) => {
  return res.status(404).json({ success: false, message: 'Not found' });
});


export default router;

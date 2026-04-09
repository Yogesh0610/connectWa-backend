import express from "express";
import multer from "multer";

// ✅ Correct middleware path
import { authenticate } from '../middlewares/auth.js';
// ─── Controllers ─────────────────────────────────────────

// OAuth
import {
  getAuthUrl,
  handleCallback,
  getOAuthAccounts,
  saveSelectedAccounts,
  connectManual,
  getAdAccounts,
  disconnectAccount,
} from "../controllers/meta-oauth.controller.js";

// Campaigns
import {
  getCampaigns,
  createCampaign,
  syncCampaigns,
  updateCampaignStatus,
  getCampaignInsights,
  deleteCampaign,
  refreshAccountToken,
} from "../controllers/meta-campaign.controller.js";

// Ad Sets (IMPORTANT: only from ONE file)
import {
  createAdSet,
  getAdSets,
  getAdSetById,
  updateAdSet,
  updateAdSetStatus,
  deleteAdSet,
  searchInterests,
  searchBehaviors,
  getCustomAudiences,
  getAdSetInsights,
} from "../controllers/meta-adset.controller.js";

// Lead Forms
import {
  getLeadForms,
  getLeadFormById,
  createLeadForm,
  getFormLeads,
  archiveLeadForm,
  getAccountPages,
} from "../controllers/meta-leadform.controller.js";

// Ads
import {
  uploadImage,
  createAd,
  getAds,
} from "../controllers/meta-ad.controller.js";

// ─── Init ────────────────────────────────────────────────
const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ─── Public (OAuth Callback) ──────────────────────────────
router.get("/oauth/callback", handleCallback);

// ─── Protected Routes ─────────────────────────────────────
router.use(authenticate);

// ─── Ad Accounts ─────────────────────────────────────────
router.get("/oauth/url", getAuthUrl);
router.get("/oauth/accounts", getOAuthAccounts);
router.post("/oauth/accounts", saveSelectedAccounts);
router.post("/accounts/manual", connectManual);
router.get("/accounts", getAdAccounts);
router.delete("/accounts/:id", disconnectAccount);
router.post("/accounts/:id/refresh-token", refreshAccountToken);

// ─── Campaigns ───────────────────────────────────────────
router.get("/campaigns", getCampaigns);
router.get("/campaigns/:id", async (req, res) => {
  const { MetaCampaign } = await import("../models/MetaCampaign.js");
  try {
    const campaign = await MetaCampaign.findOne({ _id: req.params.id, user_id: req.user._id });
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });
    res.json({ success: true, data: campaign });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
router.post("/campaigns", createCampaign);
router.post("/campaigns/sync/:adAccountId", syncCampaigns);
router.patch("/campaigns/:id/status", updateCampaignStatus);
router.get("/campaigns/:id/insights", getCampaignInsights);
router.delete("/campaigns/:id", deleteCampaign);

// ─── Ad Sets ─────────────────────────────────────────────
router.get("/adsets", getAdSets);
router.post("/adsets", createAdSet);
router.get("/adsets/:id", getAdSetById);
router.patch("/adsets/:id", updateAdSet);
router.patch("/adsets/:id/status", updateAdSetStatus);
router.delete("/adsets/:id", deleteAdSet);
router.get("/adsets/:id/insights", getAdSetInsights);

// Targeting helpers
router.get("/targeting/interests", searchInterests);
router.get("/targeting/behaviors", searchBehaviors);
router.get("/targeting/audiences", getCustomAudiences);

// ─── Lead Forms ──────────────────────────────────────────
router.get("/lead-forms", getLeadForms);
router.post("/lead-forms", createLeadForm);
router.get("/lead-forms/:formId", getLeadFormById);
router.get("/lead-forms/:formId/leads", getFormLeads);
router.patch("/lead-forms/:formId/archive", archiveLeadForm);
router.get("/pages", getAccountPages);

// ─── Ads ─────────────────────────────────────────────────
router.get("/ads", getAds);
router.post("/ads", createAd);
router.post("/ads/upload-image", upload.single("image"), uploadImage);

export default router;
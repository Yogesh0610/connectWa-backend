import express from "express";
import { authenticate } from '../middlewares/auth.js';
import {
  getAuthUrl, handleCallback, getOAuthAccounts,
  saveSelectedAccounts, getAdAccounts, disconnectAccount,
} from "../controllers/google-oauth.controller.js";
import {
  getCampaigns, createCampaign, syncCampaigns,
  updateCampaignStatus, updateCampaignBudget,
  getCampaignInsights, deleteCampaign, searchGeoTargets,
} from "../controllers/google-campaign.controller.js";
import {
  createAdGroup, getAdGroups, updateAdGroupStatus,
  addKeywords, getKeywordIdeas,
  createRSA, createDisplayAd, createPMaxAssetGroup,
  createLeadFormExtension, getAds, updateAdStatus,
} from "../controllers/google-ad.controller.js";

const router = express.Router();

// ─── OAuth (no auth) ───────────────────────────────────────
router.get("/oauth/callback", handleCallback);

// ─── Protected ─────────────────────────────────────────────
router.use(authenticate);

// Accounts
router.get("/oauth/url", getAuthUrl);
router.get("/oauth/accounts", getOAuthAccounts);
router.post("/oauth/accounts", saveSelectedAccounts);
router.get("/accounts", getAdAccounts);
router.delete("/accounts/:id", disconnectAccount);

// Campaigns
router.get("/campaigns", getCampaigns);
router.post("/campaigns", createCampaign);
router.post("/campaigns/sync/:adAccountId", syncCampaigns);
router.patch("/campaigns/:id/status", updateCampaignStatus);
router.patch("/campaigns/:id/budget", updateCampaignBudget);
router.delete("/campaigns/:id", deleteCampaign);
router.get("/campaigns/:id/insights", getCampaignInsights);

// Targeting helpers
router.get("/targeting/geo", searchGeoTargets);
router.get("/targeting/keywords/ideas", getKeywordIdeas);

// Ad Groups
router.get("/adgroups", getAdGroups);
router.post("/adgroups", createAdGroup);
router.patch("/adgroups/:id/status", updateAdGroupStatus);
router.post("/adgroups/:id/keywords", addKeywords);

// Ads
router.get("/ads", getAds);
router.post("/ads/rsa", createRSA);
router.post("/ads/display", createDisplayAd);
router.post("/ads/pmax", createPMaxAssetGroup);
router.post("/ads/lead-form", createLeadFormExtension);
router.patch("/ads/:id/status", updateAdStatus);

export default router;
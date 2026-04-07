import express from "express";
import { verifyFbWebhook, receiveFbLead } from "../controllers/fb-webhook.controller.js";
import { receiveGoogleLead, getGoogleWebhookInfo } from "../controllers/google-webhook.controller.js";
import {
  getFbAuthUrl,
  handleFbCallback,
  getFbOAuthPages,
  saveFbPages,
  connectFbManual,
  disconnectSource,
  refreshFbToken,
} from "../controllers/fb-oauth.controller.js";
import {
  getSources,
  createSource,
  updateSource,
  deleteSource,
  getLeads,
  retryLead,
} from "../controllers/ad-lead-source.controller.js";
import { authenticate, resolveWorkspace } from "../middlewares/auth.js";
import { checkPermission } from "../middlewares/permission.js";

const router = express.Router();

// ─── Public Webhook Routes (no auth) ──────────────────────
router.get("/webhook/facebook", verifyFbWebhook);
router.post("/webhook/facebook", receiveFbLead);
router.post("/webhook/google", receiveGoogleLead);

// ─── FB OAuth callback (no auth — FB redirect) ────────────
router.get("/oauth/facebook", handleFbCallback);

// ─── Protected Routes ──────────────────────────────────────
router.use(authenticate, resolveWorkspace);

// FB OAuth flow
router.get("/oauth/facebook/url", getFbAuthUrl);
router.get("/oauth/facebook/pages", getFbOAuthPages);
router.post("/oauth/facebook/pages", checkPermission("create.ad_leads"), saveFbPages);

// FB Manual connect
router.post("/connect/facebook/manual", checkPermission("create.ad_leads"), connectFbManual);

// Google webhook setup
router.post("/connect/google", checkPermission("create.ad_leads"), getGoogleWebhookInfo);

// Source management
router.get("/sources",                   checkPermission("view.ad_leads"),   getSources);
router.post("/sources",                  checkPermission("create.ad_leads"), createSource);
router.patch("/sources/:id",             checkPermission("update.ad_leads"), updateSource);
router.delete("/sources/:id",            checkPermission("delete.ad_leads"), disconnectSource);
router.post("/sources/:id/refresh-token",checkPermission("update.ad_leads"), refreshFbToken);

// Leads
router.get("/",          checkPermission("view.ad_leads"),   getLeads);
router.post("/:id/retry",checkPermission("update.ad_leads"), retryLead);

export default router;
import { metaOAuthService } from "../services/ads/meta/meta-oauth.service.js";
import { AdAccount } from "../models/AdAccount.js";

const FB_VERIFY_TOKEN = process.env.META_APP_VERIFY_TOKEN;

export const getAuthUrl = (req, res) => {
  try {
    const url = metaOAuthService.getAuthUrl(req.user._id.toString());
    res.json({ success: true, url });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const handleCallback = async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`${process.env.FRONTEND_URL}/ads?error=auth_denied`);

    const { userId } = JSON.parse(Buffer.from(state, "base64").toString());
    const accessToken = await metaOAuthService.exchangeToken(code);
    const adAccounts = await metaOAuthService.getAdAccounts(accessToken);

    // Save all accounts directly (auto-connect all fetched accounts)
    const saved = await Promise.all(
      adAccounts.map((account) =>
        metaOAuthService.saveAdAccount(userId, account, accessToken)
      )
    );

    return res.redirect(`${process.env.FRONTEND_URL}/ads/meta/accounts?connected=${saved.length}`);
  } catch (error) {
    console.error("Meta OAuth error:", error.message);
    return res.redirect(`${process.env.FRONTEND_URL}/ads?error=auth_failed`);
  }
};

export const getOAuthAccounts = (req, res) => {
  const oauth = req.session.meta_oauth;
  if (!oauth || Date.now() > oauth.expires_at) {
    return res.status(400).json({ success: false, message: "Session expired" });
  }
  res.json({ success: true, data: oauth.adAccounts });
};

export const saveSelectedAccounts = async (req, res) => {
  try {
    const oauth = req.session.meta_oauth;
    if (!oauth || Date.now() > oauth.expires_at) {
      return res.status(400).json({ success: false, message: "Session expired" });
    }

    const { selected_account_ids } = req.body;
    const selectedAccounts = oauth.adAccounts.filter((a) => selected_account_ids.includes(a.id));

    const saved = await Promise.all(
      selectedAccounts.map((account) =>
        metaOAuthService.saveAdAccount(oauth.userId, account, oauth.accessToken)
      )
    );

    delete req.session.meta_oauth;
    res.json({ success: true, data: saved, message: `${saved.length} account(s) connected` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const connectManual = async (req, res) => {
  try {
    const account = await metaOAuthService.connectManual(req.user._id, req.body);
    res.json({ success: true, data: account });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAdAccounts = async (req, res) => {
  try {
    const accounts = await AdAccount.find({ user_id: req.user._id, platform: "meta", is_active: true }).sort({ createdAt: -1 });
    res.json({ success: true, data: accounts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const disconnectAccount = async (req, res) => {
  try {
    await AdAccount.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user._id },
      { is_active: false }
    );
    res.json({ success: true, message: "Account disconnected" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
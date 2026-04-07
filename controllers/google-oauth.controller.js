import { googleOAuthService } from "../services/ads/google/google-oauth.service.js";
import { GoogleAdAccount } from "../models/GoogleAdAccount.js";

export const getAuthUrl = (req, res) => {
  const url = googleOAuthService.getAuthUrl(req.user._id.toString());
  res.json({ success: true, url });
};

export const handleCallback = async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`${process.env.FRONTEND_URL}/ads?error=google_denied`);

    const { userId } = JSON.parse(Buffer.from(state, "base64").toString());
    const tokens = await googleOAuthService.exchangeCode(code);
    const customerIds = await googleOAuthService.getAccessibleCustomers(tokens);

    req.session.google_oauth = {
      userId,
      tokens,
      customerIds,
      expires_at: Date.now() + 10 * 60 * 1000,
    };

    return res.redirect(`${process.env.FRONTEND_URL}/ads/google/accounts?step=select`);
  } catch (error) {
    console.error("Google OAuth error:", error.message);
    return res.redirect(`${process.env.FRONTEND_URL}/ads?error=google_failed`);
  }
};

export const getOAuthAccounts = async (req, res) => {
  try {
    const oauth = req.session.google_oauth;
    if (!oauth || Date.now() > oauth.expires_at) {
      return res.status(400).json({ success: false, message: "Session expired" });
    }

    // Fetch details for each customer
    const accounts = await Promise.all(
      oauth.customerIds.slice(0, 20).map(async (id) => {
        try {
          const details = await googleOAuthService.getCustomerDetails(id, oauth.tokens.refresh_token);
          return {
            customer_id: id,
            name: details?.descriptive_name || `Account ${id}`,
            currency: details?.currency_code,
            timezone: details?.time_zone,
            is_manager: details?.manager,
            is_test: details?.test_account,
          };
        } catch {
          return { customer_id: id, name: `Account ${id}` };
        }
      })
    );

    res.json({ success: true, data: accounts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const saveSelectedAccounts = async (req, res) => {
  try {
    const oauth = req.session.google_oauth;
    if (!oauth || Date.now() > oauth.expires_at) {
      return res.status(400).json({ success: false, message: "Session expired" });
    }

    const { selected_customer_ids } = req.body;
    const saved = await Promise.all(
      selected_customer_ids.map((id) =>
        googleOAuthService.saveAccount(oauth.userId, id, oauth.tokens)
      )
    );

    delete req.session.google_oauth;
    res.json({ success: true, data: saved, message: `${saved.length} account(s) connected` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAdAccounts = async (req, res) => {
  try {
    const accounts = await GoogleAdAccount.find({
      user_id: req.user._id,
      is_active: true,
    }).sort({ createdAt: -1 });
    res.json({ success: true, data: accounts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const disconnectAccount = async (req, res) => {
  try {
    await GoogleAdAccount.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user._id },
      { is_active: false }
    );
    res.json({ success: true, message: "Account disconnected" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
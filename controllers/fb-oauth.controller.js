import { fbOAuthService } from "../services/adLeads/fb-oauth.service.js";
import { AdLeadSource } from "../models/AdLeadSource.js";
import WhatsappWaba from "../models/whatsapp-waba.model.js";

// ✅ Helper — fetch user's waba for dynamic app_id + secret_key
const getUserWaba = async (userId) => {
  return await WhatsappWaba.findOne({
    user_id: userId,
    is_active: true,
    deleted_at: null,
  }).lean();
};

// Step 1: FB OAuth URL return karo → frontend redirect karega
export const getFbAuthUrl = async (req, res) => {
  try {
    const waba = await getUserWaba(req.user._id);
    const url = fbOAuthService.getAuthUrl(req.user._id.toString(), waba);
    res.json({ success: true, url });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Step 2: FB callback — code exchange + pages fetch
export const handleFbCallback = async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/ad-leads/sources?error=fb_auth_denied`
      );
    }

    // State se userId nikalo
    const { userId } = JSON.parse(Buffer.from(state, "base64").toString());

    // ✅ Fetch waba for this user
    const waba = await getUserWaba(userId);

    // Tokens exchange karo
    const shortToken = await fbOAuthService.exchangeCodeForToken(code, waba);
    const longToken = await fbOAuthService.getLongLivedToken(shortToken, waba);

    // Pages fetch karo
    const pages = await fbOAuthService.getUserPages(longToken);

    // Session mein temporarily store karo (frontend pages select karega)
    req.session.fb_oauth = {
      userId,
      longToken,
      pages,
      expires_at: Date.now() + 10 * 60 * 1000, // 10 min
    };

    // Frontend pe redirect — pages selection screen
    return res.redirect(
      `${process.env.FRONTEND_URL}/ad-leads/sources?step=select_pages`
    );
  } catch (error) {
    console.error("FB OAuth callback error:", error.message);
    return res.redirect(
      `${process.env.FRONTEND_URL}/ad-leads/sources?error=fb_auth_failed`
    );
  }
};

// Step 3: Session se pages list return karo
export const getFbOAuthPages = (req, res) => {
  const oauth = req.session.fb_oauth;

  if (!oauth || Date.now() > oauth.expires_at) {
    return res.status(400).json({
      success: false,
      message: "Session expired, please reconnect",
    });
  }

  res.json({ success: true, data: oauth.pages });
};

// Step 4: Owner selected pages ko save + subscribe karo
export const saveFbPages = async (req, res) => {
  try {
    const oauth = req.session.fb_oauth;
    if (!oauth || Date.now() > oauth.expires_at) {
      return res.status(400).json({ success: false, message: "Session expired" });
    }

    const { selected_page_ids } = req.body;
    if (!selected_page_ids?.length) {
      return res.status(400).json({ success: false, message: "No pages selected" });
    }

    const selectedPages = oauth.pages.filter((p) =>
      selected_page_ids.includes(p.id)
    );

    const saved = [];

    for (const page of selectedPages) {
      await fbOAuthService.subscribePage(page.id, page.access_token);

      const forms = await fbOAuthService.getPageForms(page.id, page.access_token);
      const formIds = forms.map((f) => f.id);

      const sourceType = page.category?.toLowerCase().includes("instagram")
        ? "instagram"
        : "facebook";

      const source = await AdLeadSource.findOneAndUpdate(
        { fb_page_id: page.id, user_id: req.user._id },
        {
          user_id: req.user._id,
          workspace_id: req.workspace_id,
          source_type: sourceType,
          name: page.name,
          fb_page_id: page.id,
          fb_page_name: page.name,
          fb_access_token: page.access_token,
          fb_long_lived_token: oauth.longToken,
          fb_form_ids: formIds,
          is_active: true,
          connection_method: "oauth",
          last_synced_at: new Date(),
        },
        { upsert: true, new: true }
      );

      saved.push(source);
    }

    delete req.session.fb_oauth;

    res.json({
      success: true,
      data: saved,
      message: `${saved.length} page(s) connected`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Manual token connect
export const connectFbManual = async (req, res) => {
  try {
    const { page_id, page_access_token, name, source_type = "facebook" } = req.body;

    if (!page_id || !page_access_token) {
      return res.status(400).json({
        success: false,
        message: "page_id and page_access_token required",
      });
    }

    // Token verify karo
    const verify = await fbOAuthService.verifyToken(page_access_token);
    if (!verify.valid) {
      return res.status(400).json({ success: false, message: "Invalid access token" });
    }

    await fbOAuthService.subscribePage(page_id, page_access_token);

    const forms = await fbOAuthService.getPageForms(page_id, page_access_token);
    const formIds = forms.map((f) => f.id);

    const source = await AdLeadSource.findOneAndUpdate(
      { fb_page_id: page_id, user_id: req.user._id },
      {
        user_id: req.user._id,
        workspace_id: req.workspace_id,
        source_type,
        name: name || `Page ${page_id}`,
        fb_page_id: page_id,
        fb_page_name: name || "",
        fb_access_token: page_access_token,
        fb_form_ids: formIds,
        is_active: true,
        connection_method: "manual",
        last_synced_at: new Date(),
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, data: source });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Source disconnect karo
export const disconnectSource = async (req, res) => {
  try {
    const source = await AdLeadSource.findOne({
      _id: req.params.id,
      user_id: req.user._id,
    });

    if (!source) {
      return res.status(404).json({ success: false, message: "Source not found" });
    }

    if (source.fb_page_id && source.fb_access_token) {
      try {
        await fbOAuthService.unsubscribePage(
          source.fb_page_id,
          source.fb_access_token
        );
      } catch {
        console.warn("FB unsubscribe failed — continuing disconnect");
      }
    }

    await AdLeadSource.findByIdAndDelete(source._id);

    res.json({ success: true, message: "Source disconnected" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Token refresh karo (manual trigger)
export const refreshFbToken = async (req, res) => {
  try {
    const source = await AdLeadSource.findOne({
      _id: req.params.id,
      user_id: req.user._id,
    });

    if (!source?.fb_access_token) {
      return res.status(404).json({ success: false, message: "Source not found" });
    }

    // ✅ Fetch waba for fresh credentials
    const waba = await getUserWaba(req.user._id);
    const newToken = await fbOAuthService.getLongLivedToken(
      source.fb_access_token,
      waba
    );

    await AdLeadSource.findByIdAndUpdate(source._id, {
      fb_access_token: newToken,
      last_synced_at: new Date(),
    });

    res.json({ success: true, message: "Token refreshed" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
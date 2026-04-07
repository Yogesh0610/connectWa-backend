import axios from "axios";

class FbOAuthService {

  // ✅ Dynamic getters — read fresh on every call
  get appId() {
    return process.env.FB_APP_ID;
  }

  get appSecret() {
    return process.env.FB_APP_SECRET;
  }

  get redirectUri() {
    return `${process.env.APP_URL}/api/ad-leads/oauth/facebook/callback`;
  }

  // ✅ Resolve credentials — user's waba first, fallback to env
  resolveCredentials(waba = null) {
    return {
      appId:     waba?.app_id     || this.appId,
      appSecret: waba?.secret_key || this.appSecret,
    };
  }

  // Step 1: OAuth URL generate karo
  getAuthUrl(userId, waba = null) {
    const { appId } = this.resolveCredentials(waba);
    const state = Buffer.from(JSON.stringify({ userId })).toString("base64");
    const scopes = [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_ads",
      "ads_management",
    ].join(",");

    return `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&scope=${scopes}&state=${state}&response_type=code`;
  }

  // Step 2: Code → Short-lived token
  async exchangeCodeForToken(code, waba = null) {
    const { appId, appSecret } = this.resolveCredentials(waba);
    const response = await axios.get("https://graph.facebook.com/v19.0/oauth/access_token", {
      params: {
        client_id:    appId,
        client_secret: appSecret,
        redirect_uri:  this.redirectUri,
        code,
      },
    });
    return response.data.access_token;
  }

  // Step 3: Short-lived → Long-lived token (60 days)
  async getLongLivedToken(shortLivedToken, waba = null) {
    const { appId, appSecret } = this.resolveCredentials(waba);
    const response = await axios.get("https://graph.facebook.com/v19.0/oauth/access_token", {
      params: {
        grant_type:       "fb_exchange_token",
        client_id:        appId,
        client_secret:    appSecret,
        fb_exchange_token: shortLivedToken,
      },
    });
    return response.data.access_token;
  }

  // Step 4: User ki pages fetch karo
  async getUserPages(longLivedToken) {
    const response = await axios.get("https://graph.facebook.com/v19.0/me/accounts", {
      params: {
        access_token: longLivedToken,
        fields: "id,name,access_token,category,picture",
      },
    });
    return response.data.data;
  }

  // Step 5: Page ko leadgen webhook subscribe karo
  async subscribePage(pageId, pageAccessToken) {
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`,
      {},
      {
        params: {
          access_token:      pageAccessToken,
          subscribed_fields: "leadgen",
        },
      }
    );
    return response.data;
  }

  // Step 6: Page unsubscribe karo
  async unsubscribePage(pageId, pageAccessToken) {
    await axios.delete(
      `https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`,
      { params: { access_token: pageAccessToken } }
    );
  }

  // Token valid hai ya nahi check karo
  async verifyToken(accessToken) {
    try {
      const response = await axios.get("https://graph.facebook.com/v19.0/me", {
        params: { access_token: accessToken, fields: "id,name" },
      });
      return { valid: true, data: response.data };
    } catch {
      return { valid: false };
    }
  }

  // Page ke lead forms fetch karo
  async getPageForms(pageId, pageAccessToken) {
    const response = await axios.get(
      `https://graph.facebook.com/v19.0/${pageId}/leadgen_forms`,
      {
        params: {
          access_token: pageAccessToken,
          fields: "id,name,status,leads_count,created_time",
        },
      }
    );
    return response.data.data;
  }
}

export const fbOAuthService = new FbOAuthService();
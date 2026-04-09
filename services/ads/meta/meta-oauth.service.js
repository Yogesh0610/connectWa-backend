import axios from "axios";
import { AdAccount } from "../../../models/AdAccount.js";

class MetaOAuthService {
  constructor() {
    this.appId = process.env.META_APP_ID;
    this.appSecret = process.env.META_APP_SECRET;
    this.redirectUri = `${process.env.APP_URL}/api/meta-ads/oauth/callback`;
    this.apiVersion = "v21.0";
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  // Step 1: OAuth URL
  getAuthUrl(userId) {
    const state = Buffer.from(JSON.stringify({ userId })).toString("base64");
    const scopes = [
      "ads_management",
      "ads_read",
      "business_management",
      "pages_read_engagement",
      "pages_manage_ads",
    ].join(",");

    return `https://www.facebook.com/${this.apiVersion}/dialog/oauth?client_id=${this.appId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&scope=${scopes}&state=${state}&response_type=code`;
  }

  // Step 2: Code → Long-lived token
  async exchangeToken(code) {
    const short = await axios.get(`${this.baseUrl}/oauth/access_token`, {
      params: {
        client_id: this.appId,
        client_secret: this.appSecret,
        redirect_uri: this.redirectUri,
        code,
      },
    });

    const long = await axios.get(`${this.baseUrl}/oauth/access_token`, {
      params: {
        grant_type: "fb_exchange_token",
        client_id: this.appId,
        client_secret: this.appSecret,
        fb_exchange_token: short.data.access_token,
      },
    });

    return long.data.access_token;
  }

  // Step 3: Get user's ad accounts
  async getAdAccounts(accessToken) {
    const res = await axios.get(`${this.baseUrl}/me/adaccounts`, {
      params: {
        access_token: accessToken,
        fields: "id,name,currency,timezone_name,account_status,business",
        limit: 50,
      },
    });
    return res.data.data;
  }

  // Step 4: Get pages linked to ad account
  async getPages(accessToken) {
    const res = await axios.get(`${this.baseUrl}/me/accounts`, {
      params: {
        access_token: accessToken,
        fields: "id,name,access_token,instagram_business_account",
      },
    });
    return res.data.data.map((p) => ({
      page_id: p.id,
      page_name: p.name,
      page_access_token: p.access_token,
      instagram_actor_id: p.instagram_business_account?.id || null,
    }));
  }

  // Save connected ad account
  async saveAdAccount(userId, adAccountData, accessToken) {
    const pages = await this.getPages(accessToken);

    return await AdAccount.findOneAndUpdate(
      { meta_ad_account_id: adAccountData.id, user_id: userId },
      {
        user_id: userId,
        platform: "meta",
        meta_ad_account_id: adAccountData.id,
        meta_ad_account_name: adAccountData.name,
        meta_business_id: adAccountData.business?.id,
        meta_access_token: accessToken,
        meta_pages: pages,
        name: adAccountData.name,
        currency: adAccountData.currency,
        timezone: adAccountData.timezone_name,
        is_active: true,
        connection_method: "oauth",
        last_synced_at: new Date(),
      },
      { upsert: true, new: true }
    );
  }

  // Manual connect
  async connectManual(userId, { ad_account_id, access_token, name }) {
    // Verify token
    const res = await axios.get(`${this.baseUrl}/${ad_account_id}`, {
      params: {
        access_token,
        fields: "id,name,currency,timezone_name",
      },
    });

    const pages = await this.getPages(access_token);

    return await AdAccount.findOneAndUpdate(
      { meta_ad_account_id: ad_account_id, user_id: userId },
      {
        user_id: userId,
        platform: "meta",
        meta_ad_account_id: res.data.id,
        meta_ad_account_name: res.data.name,
        meta_access_token: access_token,
        meta_pages: pages,
        name: name || res.data.name,
        currency: res.data.currency,
        timezone: res.data.timezone_name,
        is_active: true,
        connection_method: "manual",
        last_synced_at: new Date(),
      },
      { upsert: true, new: true }
    );
  }
}

export const metaOAuthService = new MetaOAuthService();
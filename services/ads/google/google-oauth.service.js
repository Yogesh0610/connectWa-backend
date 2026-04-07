import { google } from "googleapis";
import { GoogleAdAccount } from "../../../models/GoogleAdAccount.js";

class GoogleOAuthService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.APP_URL}/api/google-ads/oauth/callback`
    );

    this.scopes = [
      "https://www.googleapis.com/auth/adwords",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ];
  }

  // Step 1: Auth URL
  getAuthUrl(userId) {
    const state = Buffer.from(JSON.stringify({ userId })).toString("base64");
    return this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: this.scopes,
      state,
      prompt: "consent",           // force refresh_token
    });
  }

  // Step 2: Code → Tokens
  async exchangeCode(code) {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    return tokens;
  }

  // Step 3: Get accessible customer accounts
  async getAccessibleCustomers(accessToken) {
    const { GoogleAdsApi } = await import("google-ads-api");
    const client = new GoogleAdsApi({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    });

    const customer = client.Customer({
      customer_id: "0",   // dummy — ListAccessibleCustomers doesn't need real ID
      refresh_token: accessToken.refresh_token,
    });

    const res = await customer.listAccessibleCustomers();
    return res.resource_names.map((name) => name.replace("customers/", ""));
  }

  // Step 4: Get customer details
  async getCustomerDetails(customerId, refreshToken) {
    const { GoogleAdsApi } = await import("google-ads-api");
    const client = new GoogleAdsApi({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    });

    const customer = client.Customer({
      customer_id: customerId,
      refresh_token: refreshToken,
    });

    const res = await customer.query(`
      SELECT
        customer.id,
        customer.descriptive_name,
        customer.currency_code,
        customer.time_zone,
        customer.manager,
        customer.test_account
      FROM customer
      LIMIT 1
    `);

    return res[0]?.customer;
  }

  // Save account to DB
  async saveAccount(userId, customerId, tokens, accountName) {
    const details = await this.getCustomerDetails(customerId, tokens.refresh_token);

    return await GoogleAdAccount.findOneAndUpdate(
      { google_customer_id: customerId, user_id: userId },
      {
        user_id: userId,
        google_customer_id: customerId,
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
        google_token_expiry: new Date(tokens.expiry_date),
        name: accountName || details?.descriptive_name || `Account ${customerId}`,
        currency: details?.currency_code || "INR",
        timezone: details?.time_zone || "Asia/Kolkata",
        is_active: true,
        connection_method: "oauth",
        last_synced_at: new Date(),
      },
      { upsert: true, new: true }
    );
  }

  // Get fresh OAuth2 client for an account
  async getClient(adAccountDbId) {
    const account = await GoogleAdAccount.findById(adAccountDbId);
    if (!account) throw new Error("Google Ad Account not found");

    this.oauth2Client.setCredentials({
      access_token: account.google_access_token,
      refresh_token: account.google_refresh_token,
      expiry_date: account.google_token_expiry?.getTime(),
    });

    // Auto refresh if expired
    if (account.google_token_expiry && new Date() >= account.google_token_expiry) {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      await GoogleAdAccount.findByIdAndUpdate(adAccountDbId, {
        google_access_token: credentials.access_token,
        google_token_expiry: new Date(credentials.expiry_date),
      });
      this.oauth2Client.setCredentials(credentials);
    }

    return {
      oauth2Client: this.oauth2Client,
      refreshToken: account.google_refresh_token,
      customerId: account.google_customer_id,
    };
  }
}

export const googleOAuthService = new GoogleOAuthService();
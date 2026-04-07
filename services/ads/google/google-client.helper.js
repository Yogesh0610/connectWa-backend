import { GoogleAdsApi } from "google-ads-api";
import { GoogleAdAccount } from "../../../models/GoogleAdAccount.js";

// Singleton API client
const googleAdsClient = new GoogleAdsApi({
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
});

// Get customer instance for a DB account
export async function getGoogleCustomer(adAccountDbId) {
  const account = await GoogleAdAccount.findById(adAccountDbId).select(
    "google_customer_id google_refresh_token google_manager_id"
  );
  if (!account) throw new Error("Google Ad Account not found");

  return googleAdsClient.Customer({
    customer_id: account.google_customer_id.replace(/-/g, ""),
    refresh_token: account.google_refresh_token,
    ...(account.google_manager_id && {
      login_customer_id: account.google_manager_id.replace(/-/g, ""),
    }),
  });
}

// Convert INR to micros
export const toMicros = (amount) => Math.round(amount * 1_000_000);

// Convert micros to INR
export const fromMicros = (micros) => micros / 1_000_000;

// Format customer ID (remove dashes)
export const formatCustomerId = (id) => String(id).replace(/-/g, "");

// GAQL date format
export const toGoogleDate = (date) => {
  const d = new Date(date);
  return d.toISOString().split("T")[0].replace(/-/g, "");
};
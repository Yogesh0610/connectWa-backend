import axios from 'axios';
import crypto from 'crypto';
import { SocialAccount } from '../../models/SocialAccount.js';

const TWITTER_AUTH  = 'https://twitter.com/i/oauth2/authorize';
const TWITTER_TOKEN = 'https://api.twitter.com/2/oauth2/token';
const TWITTER_API   = 'https://api.twitter.com/2';

// In-memory PKCE store (keyed by state): { codeVerifier, userId }
const pkceStore = new Map();

function base64url(buf) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

class TwitterService {
  // ── OAuth 2.0 PKCE ─────────────────────────────────────────────────────────

  getAuthUrl(userId) {
    const codeVerifier  = base64url(crypto.randomBytes(32));
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
    const state         = base64url(crypto.randomBytes(16));

    pkceStore.set(state, { codeVerifier, userId: String(userId) });
    // Clean up after 10 min
    setTimeout(() => pkceStore.delete(state), 10 * 60 * 1000);

    const params = new URLSearchParams({
      response_type:         'code',
      client_id:             process.env.TWITTER_CLIENT_ID,
      redirect_uri:          `${process.env.BACKEND_URL}/api/social/twitter/callback`,
      scope:                 'tweet.read tweet.write users.read offline.access',
      state,
      code_challenge:        codeChallenge,
      code_challenge_method: 'S256',
    });
    return `${TWITTER_AUTH}?${params}`;
  }

  async exchangeCode(code, state) {
    const entry = pkceStore.get(state);
    if (!entry) throw new Error('Invalid or expired OAuth state');
    pkceStore.delete(state);

    const { codeVerifier, userId } = entry;

    const credentials = Buffer.from(
      `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
    ).toString('base64');

    const res = await axios.post(TWITTER_TOKEN,
      new URLSearchParams({
        code,
        grant_type:    'authorization_code',
        redirect_uri:  `${process.env.BACKEND_URL}/api/social/twitter/callback`,
        code_verifier: codeVerifier,
      }),
      {
        headers: {
          Authorization:  `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return { ...res.data, userId };
  }

  async refreshAccessToken(account) {
    if (!account.refresh_token) throw new Error('No refresh token stored');

    const credentials = Buffer.from(
      `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
    ).toString('base64');

    const res = await axios.post(TWITTER_TOKEN,
      new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: account.refresh_token,
      }),
      {
        headers: {
          Authorization:  `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const expiresAt = new Date(Date.now() + res.data.expires_in * 1000);
    await SocialAccount.findByIdAndUpdate(account._id, {
      access_token:     res.data.access_token,
      refresh_token:    res.data.refresh_token || account.refresh_token,
      token_expires_at: expiresAt,
    });
    return res.data.access_token;
  }

  async ensureFreshToken(account) {
    if (account.token_expires_at && new Date(account.token_expires_at) < new Date(Date.now() + 5 * 60 * 1000)) {
      return this.refreshAccessToken(account);
    }
    return account.access_token;
  }

  // ── Profile ──────────────────────────────────────────────────────────────────

  async getProfile(accessToken) {
    const res = await axios.get(`${TWITTER_API}/users/me`, {
      params: { 'user.fields': 'id,name,username,profile_image_url' },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const u = res.data.data;
    return {
      id:       u.id,
      name:     u.name,
      username: u.username,
      picture:  u.profile_image_url,
      urn:      null,
    };
  }

  // ── Connect / Save ─────────────────────────────────────────────────────────

  async connectAccount(userId, tokenData) {
    const { access_token, refresh_token, expires_in } = tokenData;
    const profile  = await this.getProfile(access_token);
    const expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : null;

    return SocialAccount.findOneAndUpdate(
      { user_id: userId, platform: 'twitter', account_id: profile.id },
      {
        $set: {
          user_id:          userId,
          platform:         'twitter',
          account_type:     'profile',
          account_id:       profile.id,
          account_name:     profile.name,
          account_username: profile.username,
          profile_picture:  profile.picture,
          access_token,
          refresh_token:    refresh_token || null,
          token_expires_at: expiresAt,
          is_active:        true,
          deleted_at:       null,
        },
      },
      { upsert: true, new: true }
    );
  }

  // ── Create Tweet ──────────────────────────────────────────────────────────

  async createTweet(accessToken, { content, hashtags = [], link_url }) {
    const hashtagText = hashtags.map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ');
    let text = content;
    if (hashtagText) text += `\n\n${hashtagText}`;
    if (link_url)    text += `\n${link_url}`;

    // Twitter limit: 280 chars
    if (text.length > 280) text = text.slice(0, 277) + '...';

    const res = await axios.post(`${TWITTER_API}/tweets`,
      { text },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
    return res.data.data.id;
  }

  // ── Analytics (tweet metrics) ─────────────────────────────────────────────

  async getTweetMetrics(accessToken, tweetId) {
    try {
      const res = await axios.get(`${TWITTER_API}/tweets/${tweetId}`, {
        params: { 'tweet.fields': 'public_metrics' },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const m = res.data.data?.public_metrics || {};
      return {
        likes:       m.like_count       || 0,
        comments:    m.reply_count      || 0,
        shares:      m.retweet_count    || 0,
        impressions: m.impression_count || 0,
        clicks:      m.url_link_clicks  || 0,
      };
    } catch {
      return { likes: 0, comments: 0, shares: 0, impressions: 0, clicks: 0 };
    }
  }
}

export const twitterService = new TwitterService();

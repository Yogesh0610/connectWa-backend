import { SocialAccount } from '../models/SocialAccount.js';
import { linkedInService } from '../services/social/social-linkedin.service.js';
import { twitterService }  from '../services/social/social-twitter.service.js';

// ── LinkedIn OAuth ────────────────────────────────────────────────────────────

export const getLinkedInAuthUrl = (req, res) => {
  const url = linkedInService.getAuthUrl(req.user._id);
  res.json({ success: true, data: { url } });
};

export const handleLinkedInCallback = async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL}/social/accounts?error=${encodeURIComponent(error)}`);
  }

  try {
    let userId;
    try {
      userId = JSON.parse(Buffer.from(state, 'base64').toString()).userId;
    } catch {
      return res.redirect(`${process.env.FRONTEND_URL}/social/accounts?error=invalid_state`);
    }

    const tokenData = await linkedInService.exchangeCode(code);
    const account   = await linkedInService.connectAccount(userId, tokenData.access_token, tokenData.expires_in);

    res.redirect(`${process.env.FRONTEND_URL}/social/accounts?connected=linkedin&id=${account._id}`);
  } catch (err) {
    console.error('[SocialAccount] LinkedIn callback error:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}/social/accounts?error=${encodeURIComponent(err.message)}`);
  }
};

// ── List Accounts ─────────────────────────────────────────────────────────────

export const getAccounts = async (req, res) => {
  try {
    const { platform } = req.query;
    const filter = { user_id: req.user._id, is_active: true, deleted_at: null };
    if (platform) filter.platform = platform;

    const accounts = await SocialAccount.find(filter).sort({ createdAt: -1 })
      .select('-access_token -refresh_token');
    res.json({ success: true, data: accounts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Disconnect ────────────────────────────────────────────────────────────────

export const disconnectAccount = async (req, res) => {
  try {
    const account = await SocialAccount.findOne({ _id: req.params.id, user_id: req.user._id });
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

    account.is_active  = false;
    account.deleted_at = new Date();
    await account.save();

    res.json({ success: true, message: 'Account disconnected' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Twitter OAuth ─────────────────────────────────────────────────────────────

export const getTwitterAuthUrl = (req, res) => {
  const url = twitterService.getAuthUrl(req.user._id);
  res.json({ success: true, data: { url } });
};

export const handleTwitterCallback = async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL}/social/accounts?error=${encodeURIComponent(error)}`);
  }
  try {
    const tokenData = await twitterService.exchangeCode(code, state);
    const account   = await twitterService.connectAccount(tokenData.userId, tokenData);
    res.redirect(`${process.env.FRONTEND_URL}/social/accounts?connected=twitter&id=${account._id}`);
  } catch (err) {
    console.error('[SocialAccount] Twitter callback error:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}/social/accounts?error=${encodeURIComponent(err.message)}`);
  }
};

// ── Refresh LinkedIn Account ──────────────────────────────────────────────────

export const refreshLinkedInAccount = async (req, res) => {
  try {
    const account = await SocialAccount.findOne({
      _id:      req.params.id,
      user_id:  req.user._id,
      platform: 'linkedin',
    });
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

    // Re-fetch profile and pages using existing token
    const profile = await linkedInService.getProfile(account.access_token);
    const pages   = await linkedInService.getOrganizations(account.access_token).catch(() => []);

    account.account_name    = profile.name;
    account.profile_picture = profile.picture;
    account.pages           = pages;
    await account.save();

    res.json({ success: true, data: account });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

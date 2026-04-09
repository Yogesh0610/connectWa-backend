import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import { connectDB } from './models/index.js';
import Setting from './models/setting.model.js';
import campaignScheduler from './utils/campaign-scheduler.js';
import socialScheduler from './utils/social-scheduler.js';
import automatedResponseWorker from './utils/automated-response-worker.js';
import { fixSettingsData } from './utils/fix-settings-data.js';
import { setContactImportSocketIo } from './queues/contact-import-queue.js';
import { setHumanBridgeIO } from './services/whatsapp/human-call-bridge.service.js';
import { setWebRTCSocketIO } from './services/whatsapp/webrtc.service.js';
import webrtcService from './services/whatsapp/webrtc.service.js';
import jwt from 'jsonwebtoken';
// import './utils/system-settings.js';
import { getSequenceQueue } from './queues/sequence-queue.js';
import statusCronService from './cronjob/status.cronService.js';
import trialPeriodCronService from './cronjob/trialPeriod.cronService.js';

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

async function loadStripeKeysFromSettings() {
  try {
    const setting = await Setting.findOne().select('stripe_secret_key stripe_publishable_key stripe_webhook_secret').lean();
    if (setting?.stripe_secret_key) {
      process.env.STRIPE_SECRET_KEY = setting.stripe_secret_key;
    }
    if (setting?.stripe_publishable_key) {
      process.env.STRIPE_PUBLISHABLE_KEY = setting.stripe_publishable_key;
    }
    if (setting?.stripe_webhook_secret) {
      process.env.STRIPE_WEBHOOK_SECRET = setting.stripe_webhook_secret;
    }
  } catch (err) {
    console.warn('Could not load Stripe keys from settings:', err.message);
  }
}

async function loadRazorpayKeysFromSettings() {
  try {
    const setting = await Setting.findOne().select('razorpay_key_id razorpay_key_secret razorpay_webhook_secret').lean();
    if (setting?.razorpay_key_id) {
      process.env.RAZORPAY_KEY_ID = setting.razorpay_key_id;
    }
    if (setting?.razorpay_key_secret) {
      process.env.RAZORPAY_KEY_SECRET = setting.razorpay_key_secret;
    }
    if (setting?.razorpay_webhook_secret) {
      process.env.RAZORPAY_WEBHOOK_SECRET = setting.razorpay_webhook_secret;
    }
  } catch (err) {
    console.warn('Could not load Razorpay keys from settings:', err.message);
  }
}

const PORT = process.env.PORT || 5001;
const httpServer = createServer(app);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:3000', 'http://localhost:5173'];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
  path: '/socket.io',
});

app.set('io', io);
setContactImportSocketIo(io);
setHumanBridgeIO(io);
setWebRTCSocketIO(io);

import('./services/whatsapp/unified-whatsapp.service.js').then(module => {
  module.default.setIO(io);
}).catch(err => console.error('Error setting IO in unifiedWhatsAppService:', err));

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded._id || decoded.id || decoded.userId;
  } catch {
    // token invalid — still allow connection, room join handled per-event
  }
  next();
});

io.on('connection', (socket) => {
  // Join personal room so targeted events (call:incoming, call:missed) work
  if (socket.userId) {
    socket.join(`user:${socket.userId}`);
  }

  // Client can also join explicitly (e.g. after auth resolves)
  socket.on('join:user', (userId) => {
    if (userId) socket.join(`user:${userId}`);
  });

  // Browser agent sends PCM audio frames to relay to Meta
  socket.on('call:audio:to_contact', ({ waCallId, pcmBase64 }) => {
    if (waCallId && pcmBase64) {
      webrtcService.queueHumanAudioFrame(waCallId, pcmBase64);
    }
  });

  socket.on('disconnect', () => {});
});

(async () => {
  try {
    await connectDB();
    await loadStripeKeysFromSettings();
    await loadRazorpayKeysFromSettings();
    await fixSettingsData();
    await statusCronService();
    await trialPeriodCronService();


    import('./services/whatsapp/unified-whatsapp.service.js').then(module => {
      module.default.initializeAllConnections();
    }).catch(err => console.error('Error importing unifiedWhatsAppService for initialization:', err));

    httpServer.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log('WebSocket (Socket.IO) enabled at path /socket.io');

      campaignScheduler.start();
      console.log('Campaign scheduler started');

      socialScheduler.start();
      console.log('Social post scheduler started');

      automatedResponseWorker.start();
      console.log('Automated response worker started');

      getSequenceQueue().catch(err => console.error('Error starting sequence queue worker', err));
    });
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }

  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down gracefully`);
    httpServer.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})();

/**
 * Human Call Bridge Service
 *
 * Manages the lifecycle of inbound WhatsApp calls routed to human agents:
 *
 * Option C flow:
 *   1. Call arrives → check SIP config for this phone number
 *   2a. SIP enabled  → Meta routes automatically (no server action needed, just log)
 *   2b. No SIP       → store pending SDP offer, emit socket notification to agent's browser
 *   3. Agent accepts → server answers Meta via WebRTC, relays audio to/from browser
 *   4. Agent rejects / timeout → server terminates the call
 */

import { WhatsappCallLog, WhatsappCallSetting } from '../../models/index.js';
import webrtcService from './webrtc.service.js';
import whatsappCallingService from './whatsapp-calling.service.js';

// waCallId → { timer, phoneNumberId, agent }
const pendingCalls = new Map();

let _io = null;
export function setHumanBridgeIO(io) { _io = io; }
export function getHumanBridgeIO() { return _io; }

/**
 * Route an inbound call to a human agent.
 * Called from call-automation.service.js when agent_type === 'human'.
 */
export async function routeToHuman({ waCallId, phoneNumberId, sdpOffer, agent, contact, callLog }) {
    // ── Check SIP ──────────────────────────────────────────────────────────────
    const settings = await WhatsappCallSetting.findOne({
        phone_number_id: phoneNumberId,
        deleted_at: null,
    }).lean();

    const sipEnabled =
        settings?.sip_config?.status === 'ENABLED' &&
        Array.isArray(settings?.sip_config?.servers) &&
        settings.sip_config.servers.length > 0 &&
        agent.sip_extension?.trim();

    if (sipEnabled) {
        // Meta routes to SIP automatically once the call is accepted via
        // the call settings. Nothing to do server-side except log it.
        callLog.routing_type   = 'human_sip';
        callLog.status         = 'ringing';
        callLog.notified_user_id = agent.assigned_user_id;
        await callLog.save();

        console.log(`[HumanBridge] SIP routing for call ${waCallId} → ext ${agent.sip_extension}`);
        return;
    }

    // ── WebRTC fallback ────────────────────────────────────────────────────────
    // Pre-answer Meta's WebRTC offer IMMEDIATELY so ICE candidates don't expire
    // while waiting for the agent to click Accept. Audio relay is held until agent accepts.
    const humanAgentStub = { ...agent.toObject?.() || agent, agent_type: 'human' };

    let sdpAnswer;
    try {
        sdpAnswer = await webrtcService.answerCallForHuman(waCallId, phoneNumberId, sdpOffer, humanAgentStub, callLog);
        await whatsappCallingService.sendCallEvent(phoneNumberId, waCallId, 'PRE_ACCEPT', {
            sdp_type: 'answer',
            sdp: sdpAnswer,
        });
        console.log(`[HumanBridge] Pre-answered Meta WebRTC for call ${waCallId}`);
    } catch (err) {
        console.error(`[HumanBridge] Failed to pre-answer WebRTC for ${waCallId}:`, err.message);
    }

    callLog.routing_type      = 'human_pending';
    callLog.status            = 'ringing';
    callLog.notified_user_id  = agent.assigned_user_id;
    await callLog.save();

    // Notify the assigned user's browser
    const payload = {
        waCallId,
        callLogId:     callLog._id.toString(),
        phoneNumberId,
        contact: contact ? {
            _id:          contact._id,
            name:         contact.name,
            phone_number: contact.phone_number,
        } : null,
        agentName: agent.name,
    };

    if (_io) {
        _io.to(`user:${agent.assigned_user_id}`).emit('call:incoming', payload);
        console.log(`[HumanBridge] Socket notification sent to user ${agent.assigned_user_id} for call ${waCallId}`);
    }

    // Ring timeout
    const timeoutMs = (agent.ring_timeout_seconds || 30) * 1000;
    const timer = setTimeout(() => handleRingTimeout(waCallId, callLog._id, agent.assigned_user_id), timeoutMs);
    pendingCalls.set(waCallId, { timer, phoneNumberId, agent });
}

/**
 * Human agent accepted the call from their browser.
 * Answer Meta's WebRTC offer and return the SDP answer to send back.
 */
export async function humanAnswerCall({ waCallId, callLogId }) {
    const callLog = await WhatsappCallLog.findById(callLogId);
    if (!callLog) throw new Error('Call log not found');

    const pending = pendingCalls.get(waCallId);
    if (pending) {
        clearTimeout(pending.timer);
        pendingCalls.delete(waCallId);
    }

    const userId = callLog.notified_user_id?.toString();

    // WebRTC was already negotiated with Meta on call arrival.
    // Now enable audio relay: Meta audio → browser, browser audio → Meta.
    const relayStarted = webrtcService.startHumanAudioRelay(waCallId, userId);
    if (!relayStarted) {
        throw new Error(`WebRTC connection not found for call ${waCallId} — it may have already ended`);
    }

    callLog.routing_type = 'human_webrtc';
    callLog.status       = 'answered';
    await callLog.save();

    console.log(`[HumanBridge] Call ${waCallId} answered by human via WebRTC`);
}

/**
 * Human agent rejected the call.
 */
export async function humanRejectCall({ waCallId, callLogId }) {
    const pending = pendingCalls.get(waCallId);
    if (pending) {
        clearTimeout(pending.timer);
        pendingCalls.delete(waCallId);
        await whatsappCallingService.terminateCall(pending.phoneNumberId, waCallId);
    }

    await WhatsappCallLog.findByIdAndUpdate(callLogId, {
        status: 'missed',
        end_time: new Date(),
        routing_type: 'human_webrtc',
    });

    console.log(`[HumanBridge] Call ${waCallId} rejected by human agent`);
}

/** Internal: called when ring timer expires */
async function handleRingTimeout(waCallId, callLogId, assignedUserId) {
    pendingCalls.delete(waCallId);

    const callLog = await WhatsappCallLog.findById(callLogId);
    if (!callLog || callLog.status !== 'ringing') return;

    callLog.status   = 'missed';
    callLog.end_time = new Date();
    await callLog.save();

    if (_io) {
        _io.to(`user:${assignedUserId}`).emit('call:missed', { waCallId, callLogId: callLogId.toString() });
    }

    try {
        await whatsappCallingService.terminateCall(callLog.phone_number_id, waCallId);
    } catch (e) {
        console.warn(`[HumanBridge] Could not terminate timed-out call ${waCallId}:`, e.message);
    }

    console.log(`[HumanBridge] Call ${waCallId} timed out — marked missed`);
}

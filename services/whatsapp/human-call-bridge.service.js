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

import { WhatsappCallLog, WhatsappCallSetting, Contact, WhatsappPhoneNumber, Message } from '../../models/index.js';
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
    // Set up the WebRTC peer connection locally so ICE candidates are gathered
    // NOW (before agent accepts). We store the SDP answer and only send
    // PRE_ACCEPT + ACCEPT to Meta when the agent actually clicks "Accept".
    // This prevents the contact's call timer from starting prematurely.
    const humanAgentStub = { ...agent.toObject?.() || agent, agent_type: 'human' };

    let sdpAnswer;
    try {
        sdpAnswer = await webrtcService.answerCallForHuman(waCallId, phoneNumberId, sdpOffer, humanAgentStub, callLog);
        console.log(`[HumanBridge] WebRTC ready for call ${waCallId} — PRE_ACCEPT held until agent accepts`);
    } catch (err) {
        console.error(`[HumanBridge] Failed to set up WebRTC for ${waCallId}:`, err.message);
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
    // Store sdpAnswer so humanAnswerCall can send PRE_ACCEPT + ACCEPT at the right moment
    pendingCalls.set(waCallId, { timer, phoneNumberId, agent, sdpAnswer });
}

/**
 * Human agent accepted the call from their browser.
 * NOW send PRE_ACCEPT + ACCEPT to Meta (starting the contact's call timer),
 * then enable the audio relay between Meta and the agent's browser.
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
    const { phoneNumberId, sdpAnswer } = pending || {};

    // Send PRE_ACCEPT + ACCEPT to Meta now — this is the moment the contact's
    // call timer starts. Previously this happened on call arrival, which is wrong.
    if (phoneNumberId && sdpAnswer) {
        try {
            await whatsappCallingService.sendCallEvent(phoneNumberId, waCallId, 'PRE_ACCEPT', {
                sdp_type: 'answer',
                sdp: sdpAnswer,
            });
            await new Promise(resolve => setTimeout(resolve, 500));
            await whatsappCallingService.sendCallEvent(phoneNumberId, waCallId, 'ACCEPT', {
                sdp_type: 'answer',
                sdp: sdpAnswer,
            });
            console.log(`[HumanBridge] Sent PRE_ACCEPT + ACCEPT to Meta for call ${waCallId}`);
        } catch (err) {
            console.error(`[HumanBridge] Failed to send ACCEPT to Meta for ${waCallId}:`, err.message);
            // Don't throw — audio relay can still work even if Meta signalling partially fails
        }
    } else {
        console.warn(`[HumanBridge] No pending SDP answer found for ${waCallId} — may have already sent`);
    }

    // Enable audio relay: Meta audio → browser, browser audio → Meta
    const relayStarted = webrtcService.startHumanAudioRelay(waCallId, userId);
    if (!relayStarted) {
        throw new Error(`WebRTC connection not found for call ${waCallId} — it may have already ended`);
    }

    callLog.routing_type = 'human_webrtc';
    callLog.status       = 'answered';
    callLog.start_time   = new Date();
    await callLog.save();

    console.log(`[HumanBridge] Call ${waCallId} answered by human via WebRTC`);
}

/**
 * Human agent rejected (declined) or hung up an active call.
 * Always terminates the Meta call regardless of whether it was still ringing.
 */
export async function humanRejectCall({ waCallId, callLogId }) {
    const pending = pendingCalls.get(waCallId);
    let phoneNumberId = pending?.phoneNumberId;

    if (pending) {
        clearTimeout(pending.timer);
        pendingCalls.delete(waCallId);
    }

    // If the call was already accepted, phoneNumberId comes from the callLog
    const callLog = await WhatsappCallLog.findById(callLogId);
    if (!phoneNumberId && callLog?.phone_number_id) {
        phoneNumberId = callLog.phone_number_id;
    }

    // Always tell Meta to terminate — this is the only way to end the call on the
    // contact's side. Previously this was skipped after the agent accepted the call.
    if (phoneNumberId) {
        try {
            await whatsappCallingService.terminateCall(phoneNumberId, waCallId);
            console.log(`[HumanBridge] Sent TERMINATE to Meta for call ${waCallId}`);
        } catch (err) {
            console.warn(`[HumanBridge] Could not send TERMINATE for ${waCallId}:`, err.message);
        }
    }

    // Clean up WebRTC resources
    webrtcService.cleanup(waCallId);

    // Emit call:ended to the agent's browser so the UI dismisses
    if (_io && callLog?.notified_user_id) {
        _io.to(`user:${callLog.notified_user_id}`).emit('call:ended', {
            waCallId,
            callLogId: callLogId.toString(),
        });
    }

    const wasAnswered = callLog?.status === 'answered';
    const endStatus   = wasAnswered ? 'completed' : 'missed';

    // Compute duration if the call was answered
    let duration = 0;
    if (wasAnswered && callLog.start_time) {
        duration = Math.round((Date.now() - new Date(callLog.start_time).getTime()) / 1000);
    }

    const updatedLog = await WhatsappCallLog.findByIdAndUpdate(callLogId, {
        status:   endStatus,
        end_time: new Date(),
        duration,
        routing_type: 'human_webrtc',
    }, { new: true });

    if (updatedLog) await _createCallChatMessage(updatedLog, wasAnswered ? 'answered' : 'missed');

    console.log(`[HumanBridge] Call ${waCallId} ended by human agent (${endStatus}, ${duration}s)`);
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

    await _createCallChatMessage(callLog, 'missed');
    console.log(`[HumanBridge] Call ${waCallId} timed out — marked missed`);
}

/** Create a 'call' type message in the chat so call events appear in chat history */
async function _createCallChatMessage(callLog, waStatus) {
    try {
        const contact = await Contact.findById(callLog.contact_id).lean();
        if (!contact) return;

        const phoneNumber = await WhatsappPhoneNumber.findOne({
            phone_number_id: callLog.phone_number_id,
            deleted_at: null
        }).lean();

        const myNumber = phoneNumber?.display_phone_number || null;
        const durationSec = callLog.duration || 0;
        const mm = String(Math.floor(durationSec / 60)).padStart(2, '0');
        const ss = String(durationSec % 60).padStart(2, '0');
        const content = `WhatsApp Call${durationSec > 0 ? ` — ${mm}:${ss}` : ''}`;

        await Message.create({
            user_id: callLog.user_id,
            contact_id: callLog.contact_id,
            sender_number: contact.phone_number,
            recipient_number: myNumber,
            message_type: 'call',
            wa_status: waStatus,
            direction: 'inbound',
            from_me: false,
            content,
            wa_timestamp: callLog.end_time || new Date(),
            provider: 'business_api',
            metadata: {
                wa_call_id: callLog.wa_call_id,
                duration: durationSec,
                routing_type: callLog.routing_type,
            },
        });
        console.log(`[HumanBridge] Created call chat message for ${callLog.wa_call_id} (${waStatus})`);
    } catch (err) {
        console.error('[HumanBridge] Failed to create call chat message:', err.message);
    }
}

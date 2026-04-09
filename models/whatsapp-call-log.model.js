import mongoose from 'mongoose';

const whatsappCallLogSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    contact_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contact',
        required: true
    },
    phone_number_id: {
        type: String,
        required: true
    },
    agent_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WhatsappCallAgent'
    },
    wa_call_id: {
        type: String,
        unique: true
    },
    status: {
        type: String,
        enum: ['ringing', 'answered', 'completed', 'failed', 'missed'],
        default: 'ringing'
    },
    start_time: {
        type: Date,
        default: Date.now
    },
    end_time: {
        type: Date
    },
    duration: {
        type: Number,
        default: 0
    },
    recording_url: {
        type: String
    },
    transcription: {
        type: String,
        default: ''
    },
    transcription_json: [{
        role: { type: String, enum: ['user', 'agent'] },
        text: { type: String },
        timestamp: { type: Date }
    }],
    recordings: {
        user: [{ type: String }],
        agent: [{ type: String }]
    },
    nodes_executed: [
        {
            node_id: String,
            executed_at: Date,
            response: mongoose.Schema.Types.Mixed
        }
    ],
    triggered_functions: [
        {
            function_id: { type: String },
            function_name: { type: String },
            matched_keyword: { type: String },
            triggered_at: { type: Date },
            executed_at: { type: Date },
            result: mongoose.Schema.Types.Mixed,
            user_speech: { type: String }
        }
    ],
    metadata: {
        type: mongoose.Schema.Types.Mixed
    },
    last_api_context: {
        function_name: { type: String },
        fetched_at: { type: Date },
        data: { type: mongoose.Schema.Types.Mixed }
    },
    pending_function_call: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    collected_params: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    // 'ai' = answered by AI | 'human_sip' = routed to SIP | 'human_webrtc' = browser WebRTC | 'human_pending' = waiting for human to accept
    routing_type: {
        type: String,
        enum: ['ai', 'human_sip', 'human_webrtc', 'human_pending'],
        default: 'ai'
    },
    // For human calls: pending SDP offer from Meta (stored until agent accepts)
    pending_sdp_offer: {
        type: String,
        default: null
    },
    // For human calls: which user was notified
    notified_user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    call_type: {
        type: String,
        enum: ['inbound', 'outbound'],
        default: 'inbound'
    },
    initiated_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    trigger_reason: {
        type: String,
        enum: ['permission_granted', 'manual', 'campaign', null],
        default: null
    },
    campaign_id: {
        type: String,
        default: null
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'whatsapp_call_logs'
});

whatsappCallLogSchema.index({ wa_call_id: 1 });
whatsappCallLogSchema.index({ contact_id: 1 });
whatsappCallLogSchema.index({ user_id: 1 });

export default mongoose.model('WhatsappCallLog', whatsappCallLogSchema);

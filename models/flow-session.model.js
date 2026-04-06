import mongoose from 'mongoose';

const flowSessionSchema = new mongoose.Schema(
  {
    sender_number: {
      type: String,
      required: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    flow_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AutomationFlow',
      required: true,
    },
    whatsapp_phone_number_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WhatsappPhoneNumber',
      default: null,
    },
    current_node_id: {
      type: String,
      required: true,
    },
    session_data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    variable_name: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['waiting', 'completed', 'expired'],
      default: 'waiting',
    },
    expires_at: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'flow_sessions',
  }
);

flowSessionSchema.index({ sender_number: 1, user_id: 1, status: 1 });
flowSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('FlowSession', flowSessionSchema);

import mongoose from "mongoose";

const fieldSchema = new mongoose.Schema({
    id: { type: String, required: true },

    type: {
        type: String,
        enum: [
            "heading",
            "text",
            "number",
            "email",
            "phone",
            "password",
            "passcode",
            "textarea",
            "select",
            "radio",
            "checkbox",
            "multiselect",
            "date",
            "datetime",
            "time",
        ],
        required: true
    },

    label: { type: String, required: true },

    name: {
        type: String,
        required: false
    },

    required: { type: Boolean, default: false },

    input_type: String,

    helper_text: String,

    default_value: mongoose.Schema.Types.Mixed,

    options: [
        {
            id: String,
            label: String,
            value: String
        }
    ],

    step: { type: Number, default: 1 },

    order: { type: Number, default: 0 },

    meta: {
        flow_key: String
    }

}, { _id: false });



const formSchema = new mongoose.Schema({

    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },

    waba_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "WhatsappWaba"
    },

    name: {
        type: String,
        required: true,
        trim: true
    },

    description: String,

    slug: {
        type: String,
        unique: true
    },

    meta_status: {
        type: String,
        enum: [
            "DRAFT",
            "PUBLISHED",
            "DEPRECATED",
            "BLOCKED",
            "THROTTLED",
            "ERROR"
        ],
        default: "DRAFT",
        index: true
    },

    is_active: {
        type: Boolean,
        default: false
    },

    is_multi_step: {
        type: Boolean,
        default: false
    },

    enable_recaptcha: {
        type: Boolean,
        default: false
    },

    fields: {
        type: [fieldSchema],
        default: []
    },

    category: {
        type: String,
        enum: ["SIGN_UP", "SIGN_IN", "CONTACT_US", "CUSTOMER_SUPPORT", "SURVEY", "LEAD_GENERATION", "APPOINTMENT_BOOKING", "OTHER"],
        default: "OTHER"
    },

    flow: {
        flow_id: String,
        template_name: String,
        is_flow_enabled: {
            type: Boolean,
            default: false
        },
        last_synced_at: Date,
        sync_status: {
            type: String,
            enum: ["pending", "success", "failed"],
            default: "pending"
        },
        meta_payload: {
            type: Object,
            default: {}
        }
    },

    submit_settings: {
        button_text: {
            type: String,
            default: "Submit"
        },
        success_message: {
            type: String,
            default: "Thank you for your submission!"
        }
    },

    appearance: {
        theme_color: {
            type: String,
            default: "#3B82F6"
        },
        show_branding: {
            type: Boolean,
            default: false
        }
    },

    contact_settings: {
        auto_create_contact: {
            type: Boolean,
            default: false
        }
    },

    stats: {
        submissions: { type: Number, default: 0 }
    },

    sort_order: {
        type: Number,
        default: 0
    },

    deleted_at: {
        type: Date,
        default: null
    }

}, {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "forms"
});


export default mongoose.model("Form", formSchema);
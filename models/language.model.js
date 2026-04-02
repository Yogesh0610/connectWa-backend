import mongoose from 'mongoose';

const languageSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    locale: {
        type: String,
        required: true,
        trim: true
    },
    flag: {
        type: String,
        default: null
    },
    translation_json: {
        type: Object,
        default: null
    },
    is_rtl: {
        type: Boolean,
        default: false
    },
    is_active: {
        type: Boolean,
        default: true
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
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'languages'
});

languageSchema.index(
    { locale: 1 },
    { unique: true, partialFilterExpression: { deleted_at: null } }
);

// languageSchema.index(
//     { name: 1 },
//     { unique: true, partialFilterExpression: { deleted_at: null } }
// );

const Language = mongoose.model('Language', languageSchema);

export default Language;

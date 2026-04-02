
import mongoose from 'mongoose';

export default async function seedDefaultSettings() {
  console.log('📝 Running default settings seeder...');

  try {
    const settingSchema = new mongoose.Schema({
      key: String,
      value: mongoose.Mixed,
      type: String,
      category: String,
      description: String
    }, { timestamps: true });

    const Setting = mongoose.model('Setting', settingSchema);

    const defaultSettings = [
      {
        key: 'app_name',
        value: 'WhatsDesk',
        type: 'string',
        category: 'general',
        description: 'Application name'
      },
      {
        key: 'app_url',
        value: process.env.APP_URL || 'http://localhost:5000',
        type: 'string',
        category: 'general',
        description: 'Application URL'
      },
      {
        key: 'timezone',
        value: 'UTC',
        type: 'string',
        category: 'general',
        description: 'Default timezone'
      },
      {
        key: 'date_format',
        value: 'YYYY-MM-DD',
        type: 'string',
        category: 'general',
        description: 'Default date format'
      },
      {
        key: 'max_file_size',
        value: 10,
        type: 'number',
        category: 'media',
        description: 'Maximum file size in MB'
      },
      {
        key: 'allowed_file_types',
        value: ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx'],
        type: 'array',
        category: 'media',
        description: 'Allowed file types'
      }
    ];

    for (const setting of defaultSettings) {
      await Setting.findOneAndUpdate(
        { key: setting.key },
        setting,
        { upsert: true, new: true }
      );
    }

    console.log(`✅ Seeded ${defaultSettings.length} default settings`);
    return { success: true, count: defaultSettings.length };
  } catch (error) {
    console.error('❌ Error seeding settings:', error.message);
    return { success: false, error: error.message };
  }
}

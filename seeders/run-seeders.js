
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import seedDefaultSettings from './20251119054744-default-settings.js';

dotenv.config();

async function runAllSeeders() {
  console.log('🚀 Starting database seeding...\n');

  try {
    if (!process.env.MONGODB_URI) {
      console.error('❌ MONGODB_URI not found in environment variables');
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const seeders = [
      { name: 'Default Settings', fn: seedDefaultSettings }
    ];

    const results = [];

    for (const seeder of seeders) {
      console.log(`\n📝 Running: ${seeder.name}...`);
      try {
        const result = await seeder.fn();
        if (result.success) {
          console.log(`✅ ${seeder.name} completed successfully`);
          results.push({ name: seeder.name, success: true, ...result });
        } else {
          console.error(`❌ ${seeder.name} failed:`, result.error);
          results.push({ name: seeder.name, success: false, error: result.error });
        }
      } catch (error) {
        console.error(`❌ ${seeder.name} error:`, error.message);
        results.push({ name: seeder.name, success: false, error: error.message });
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 SEEDING SUMMARY');
    console.log('='.repeat(50));

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`Total Seeders: ${results.length}`);
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);

    if (failCount > 0) {
      console.log('\nFailed Seeders:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
    }

    console.log('='.repeat(50));

    if (successCount === results.length) {
      console.log('\n🎉 All seeders completed successfully!');
    } else {
      console.log('\n⚠️  Some seeders failed. Check the errors above.');
    }

    await mongoose.disconnect();
    console.log('\n✅ Database disconnected\n');

    process.exit(failCount > 0 ? 1 : 0);

  } catch (error) {
    console.error('\n❌ Fatal error during seeding:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runAllSeeders();

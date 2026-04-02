import bcrypt from 'bcryptjs';
import { User, Role } from '../models/index.js';


/**
 * Create default admin user
 * @param {Object} adminData - Admin user data
 */
async function createDefaultAdmin(adminData) {
  try {
    if (!adminData || !adminData.email) {
      console.error('❌ Invalid admin data provided');
      return { success: false, error: 'Invalid admin data' };
    }

  const adminEmail = process.env.ADMIN_EMAIL;

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminData.password, salt);

  const existingAdmin = await User.findOne({ email: adminEmail, deleted_at: null });

  if (!existingAdmin) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const superAdminRole = await Role.findOne({ name: 'super_admin' });

    await User.create({
      name: process.env.ADMIN_NAME || 'Admin',
      email: adminEmail,
      password: hashedPassword,
      role_id: superAdminRole ? superAdminRole._id : null,
      email_verified: true
    });

    await admin.save();
    console.log('✅ Default admin user created successfully');
    console.log(`   Email: ${adminData.email}`);

    return { success: true, user: admin };
  }
 } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    return { success: false, error: error.message };
  }
}


export default createDefaultAdmin;

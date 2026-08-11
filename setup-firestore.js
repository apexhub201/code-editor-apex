// setup-firestore.js - Tạo collections và indexes
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Đọc environment variables
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing Firebase credentials in environment variables');
    process.exit(1);
}

if (!getApps().length) {
    initializeApp({
        credential: cert({ projectId, clientEmail, privateKey })
    });
}

const db = getFirestore();

async function setup() {
    console.log('Setting up Firestore collections...\n');
    
    // Tạo collections bằng cách thêm document mẫu rồi xóa
    const collections = [
        'security_sessions',
        'security_challenges', 
        'security_rate_limits',
        'security_bans',
        'security_events',
        'security_nonces'
    ];
    
    for (const col of collections) {
        try {
            // Thêm document mẫu
            const docRef = await db.collection(col).add({
                _setup: true,
                createdAt: new Date(),
                note: 'Auto-created by setup script'
            });
            
            // Xóa document mẫu (collection vẫn tồn tại)
            await docRef.delete();
            
            console.log(`✅ Created collection: ${col}`);
        } catch (error) {
            console.error(`❌ Failed to create ${col}:`, error.message);
        }
    }
    
    console.log('\n✅ Setup complete!');
    console.log('\nNext steps:');
    console.log('1. Go to Firebase Console → Firestore');
    console.log('2. Set TTL policies for these fields:');
    console.log('   - security_sessions.expiresAt');
    console.log('   - security_challenges.expiresAt');
    console.log('   - security_rate_limits.expiresAt');
    console.log('   - security_bans.expiresAt');
    console.log('   - security_events.expiresAt');
    console.log('   - security_nonces.expiresAt');
}

setup().catch(console.error);

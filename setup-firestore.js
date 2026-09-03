// sync-firebase.js - Tạo ở ROOT của project
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

// Đọc credentials từ file JSON
const primaryCred = JSON.parse(fs.readFileSync('./apex-hub-global-service-account.json', 'utf8'));
const backupCred = JSON.parse(fs.readFileSync('./apex-hub-backup-service-account.json', 'utf8'));

// Initialize PRIMARY
const primaryApp = initializeApp({
    credential: cert(primaryCred),
    projectId: 'apex-hub-global'
}, 'primary-sync');

const primaryDB = getFirestore(primaryApp);

// Initialize BACKUP
const backupApp = initializeApp({
    credential: cert(backupCred),
    projectId: 'apex-hub-backup'
}, 'backup-sync');

const backupDB = getFirestore(backupApp);

async function syncData() {
    console.log('🔄 Bắt đầu sync từ apex-hub-global → apex-hub-backup...\n');
    
    const snapshot = await primaryDB.collection('scripts').get();
    let count = 0;
    
    for (const doc of snapshot.docs) {
        await backupDB.collection('scripts').doc(doc.id).set(doc.data());
        count++;
        console.log(`✅ Đã sync: ${doc.id}`);
    }
    
    console.log(`\n🎉 Sync hoàn tất! Tổng cộng: ${count} scripts`);
    process.exit(0);
}

syncData().catch(error => {
    console.error('❌ Sync error:', error);
    process.exit(1);
});

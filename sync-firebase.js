// sync-firebase.js - Sync toàn bộ scripts từ Primary sang Backup
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

// Đọc credentials từ file JSON
const primaryCred = JSON.parse(fs.readFileSync('./apex-hub-global-service-account.json', 'utf8'));
const backupCred = JSON.parse(fs.readFileSync('./apex-hub-backup-service-account.json', 'utf8'));

// Initialize PRIMARY
const primaryApp = initializeApp({
    credential: cert(primaryCred),
    projectId: primaryCred.project_id
}, 'primary-sync');

const primaryDB = getFirestore(primaryApp);

// Initialize BACKUP
const backupApp = initializeApp({
    credential: cert(backupCred),
    projectId: backupCred.project_id
}, 'backup-sync');

const backupDB = getFirestore(backupApp);

async function syncAllData() {
    console.log('========================================');
    console.log('🔄 BẮT ĐẦU SYNC TOÀN BỘ DỮ LIỆU');
    console.log('========================================\n');
    
    // Sync collection scripts
    console.log('📦 Syncing collection: scripts...');
    const scriptsSnapshot = await primaryDB.collection('scripts').get();
    let scriptCount = 0;
    
    for (const doc of scriptsSnapshot.docs) {
        await backupDB.collection('scripts').doc(doc.id).set(doc.data());
        scriptCount++;
        console.log(`  ✅ ${doc.id}`);
    }
    console.log(`  📊 Tổng: ${scriptCount} scripts\n`);
    
    // Sync collection raw_scripts (nếu có)
    console.log('📦 Syncing collection: raw_scripts...');
    try {
        const rawScriptsSnapshot = await primaryDB.collection('raw_scripts').get();
        let rawCount = 0;
        
        for (const doc of rawScriptsSnapshot.docs) {
            await backupDB.collection('raw_scripts').doc(doc.id).set(doc.data());
            rawCount++;
            console.log(`  ✅ ${doc.id}`);
        }
        console.log(`  📊 Tổng: ${rawCount} raw_scripts\n`);
    } catch (error) {
        console.log('  ℹ️ Collection raw_scripts không tồn tại hoặc trống\n');
    }
    
    // Sync collection users (nếu có)
    console.log('📦 Syncing collection: users...');
    try {
        const usersSnapshot = await primaryDB.collection('users').get();
        let userCount = 0;
        
        for (const doc of usersSnapshot.docs) {
            await backupDB.collection('users').doc(doc.id).set(doc.data());
            userCount++;
            console.log(`  ✅ ${doc.id}`);
        }
        console.log(`  📊 Tổng: ${userCount} users\n`);
    } catch (error) {
        console.log('  ℹ️ Collection users không tồn tại hoặc trống\n');
    }
    
    // Sync collection sessions (nếu có)
    console.log('📦 Syncing collection: sessions...');
    try {
        const sessionsSnapshot = await primaryDB.collection('sessions').get();
        let sessionCount = 0;
        
        for (const doc of sessionsSnapshot.docs) {
            await backupDB.collection('sessions').doc(doc.id).set(doc.data());
            sessionCount++;
            console.log(`  ✅ ${doc.id}`);
        }
        console.log(`  📊 Tổng: ${sessionCount} sessions\n`);
    } catch (error) {
        console.log('  ℹ️ Collection sessions không tồn tại hoặc trống\n');
    }
    
    // Sync collection notifications (nếu có)
    console.log('📦 Syncing collection: notifications...');
    try {
        const notifSnapshot = await primaryDB.collection('notifications').get();
        let notifCount = 0;
        
        for (const doc of notifSnapshot.docs) {
            await backupDB.collection('notifications').doc(doc.id).set(doc.data());
            notifCount++;
            console.log(`  ✅ ${doc.id}`);
        }
        console.log(`  📊 Tổng: ${notifCount} notifications\n`);
    } catch (error) {
        console.log('  ℹ️ Collection notifications không tồn tại hoặc trống\n');
    }
    
    console.log('========================================');
    console.log('🎉 SYNC HOÀN TẤT!');
    console.log('========================================');
    process.exit(0);
}

syncAllData().catch(error => {
    console.error('❌ Sync error:', error);
    process.exit(1);
});

// create-test-script.js
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const backupCred = JSON.parse(fs.readFileSync('./apex-hub-backup-service-account.json', 'utf8'));

const backupApp = initializeApp({
    credential: cert(backupCred),
    projectId: backupCred.project_id
}, 'backup-create');

const backupDB = getFirestore(backupApp);

async function createTest() {
    console.log('🔄 Tạo test script trong backup...\n');
    
    await backupDB.collection('scripts').doc('testuser_test').set({
        code: 'print("Test from backup")',
        name: 'test',
        created: Date.now(),
        owner: 'testuser'
    });
    
    console.log('✅ Đã tạo!');
    process.exit(0);
}

createTest().catch(error => {
    console.error('❌ Lỗi:', error);
    process.exit(1);
});

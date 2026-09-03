// migrate.js - Chạy 1 lần để chuyển dữ liệu từ Firebase sang Supabase

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// FIREBASE INIT
// ============================================================
if (!getApps().length) {
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        })
    });
}

const firestore = getFirestore();

// ============================================================
// SUPABASE INIT
// ============================================================
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// ============================================================
// MIGRATE FUNCTION
// ============================================================
async function migrate() {
    console.log('Bắt đầu migrate...');
    console.log('Đang đọc từ Firebase...');
    
    // Đọc tất cả scripts từ Firebase
    const snapshot = await firestore.collection('scripts').get();
    
    console.log(`Tìm thấy ${snapshot.size} scripts trong Firebase`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const doc of snapshot.docs) {
        const data = doc.data();
        const name = doc.id;
        
        try {
            console.log(`Đang migrate: ${name}`);
            
            const { error } = await supabase
                .from('scripts')
                .upsert({
                    name: name,
                    code: data.code || '',
                    owner: data.owner || 'public',
                    created_at: data.created || Date.now(),
                    updated_at: data.updatedAt || data.updated || Date.now()
                }, {
                    onConflict: 'name'
                });
            
            if (error) {
                console.error(`Lỗi migrate ${name}:`, error.message);
                errorCount++;
            } else {
                console.log(`✅ Thành công: ${name}`);
                successCount++;
            }
        } catch (error) {
            console.error(`Lỗi migrate ${name}:`, error.message);
            errorCount++;
        }
    }
    
    console.log('========================================');
    console.log(`Migrate hoàn tất!`);
    console.log(`✅ Thành công: ${successCount}`);
    console.log(`❌ Thất bại: ${errorCount}`);
    console.log('========================================');
}

// Chạy migrate
migrate()
    .then(() => {
        console.log('Done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migrate error:', error);
        process.exit(1);
    });

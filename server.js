const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const pool    = require('./db');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// Middleware
// ==========================================
app.use(cors());
app.use(express.json());

// ==========================================
// تهيئة قاعدة البيانات عند التشغيل
// ==========================================
async function initDB() {
    try {
        // جدول المستخدمين
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id       INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(100) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // جدول الخدمات
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS services (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                name         VARCHAR(200) NOT NULL,
                price_normal INT NOT NULL DEFAULT 0,
                price_urgent INT NOT NULL DEFAULT 0,
                visible      TINYINT(1) NOT NULL DEFAULT 1,
                created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // جدول الطلبات
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS orders (
                id             INT AUTO_INCREMENT PRIMARY KEY,
                name           VARCHAR(200) NOT NULL,
                mother_name    VARCHAR(200),
                national_id    VARCHAR(100),
                reg_no         VARCHAR(100),
                property_no    VARCHAR(100),
                region         VARCHAR(200),
                service_type   VARCHAR(200),
                urgency        VARCHAR(50) DEFAULT 'عادي',
                price          INT DEFAULT 0,
                payment_method VARCHAR(100),
                created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // إنشاء أدمن افتراضي إذا لم يوجد
        const [users] = await pool.execute('SELECT id FROM users WHERE username = ?', ['admin']);
        if (users.length === 0) {
            const defaultPass = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
            const hashed = await bcrypt.hash(defaultPass, 10);
            await pool.execute('INSERT INTO users (username, password) VALUES (?, ?)', ['admin', hashed]);
            console.log(`✅ تم إنشاء أدمن افتراضي — كلمة السر: ${defaultPass}`);
        }

        // إضافة خدمات افتراضية إذا لم توجد
        const [svcs] = await pool.execute('SELECT COUNT(*) as cnt FROM services');
        if (svcs[0].cnt === 0) {
            const defaultServices = [
                ['بيان قيد',    50000,  100000],
                ['سند تمليك',  150000,  300000],
                ['نقل ملكية',  200000,  400000],
                ['رهن عقاري',  100000,  200000],
                ['فك رهن',      80000,  160000],
            ];
            for (const [name, normal, urgent] of defaultServices) {
                await pool.execute(
                    'INSERT INTO services (name, price_normal, price_urgent) VALUES (?, ?, ?)',
                    [name, normal, urgent]
                );
            }
            console.log('✅ تم إضافة الخدمات الافتراضية');
        }

        console.log('✅ قاعدة البيانات جاهزة');
    } catch (err) {
        console.error('❌ خطأ في تهيئة قاعدة البيانات:', err.message);
    }
}

// ==========================================
// ROUTES
// ==========================================

// ── صحة السيرفر ──
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: '🏠 نظام يوسف العقاري — السيرفر يعمل' });
});

// ==========================================
// 🔐 تسجيل الدخول
// POST /login
// body: { username, password }
// ==========================================
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.json({ success: false, message: 'يرجى إدخال اسم المستخدم وكلمة السر' });
    }

    try {
        const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);

        if (rows.length === 0) {
            return res.json({ success: false, message: 'اسم المستخدم أو كلمة السر غير صحيحة' });
        }

        const user  = rows[0];
        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.json({ success: false, message: 'اسم المستخدم أو كلمة السر غير صحيحة' });
        }

        res.json({ success: true, message: 'تم تسجيل الدخول بنجاح', username: user.username });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// ==========================================
// 🔐 تغيير كلمة السر
// POST /change-password
// body: { oldPass, newPass }
// ==========================================
app.post('/change-password', async (req, res) => {
    const { oldPass, newPass } = req.body;

    if (!oldPass || !newPass) {
        return res.json({ success: false, message: 'يرجى إدخال كلمة السر الحالية والجديدة' });
    }

    try {
        const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', ['admin']);
        if (rows.length === 0) return res.json({ success: false, message: 'المستخدم غير موجود' });

        const user  = rows[0];
        const match = await bcrypt.compare(oldPass, user.password);

        if (!match) {
            return res.json({ success: false, message: 'كلمة السر الحالية غير صحيحة' });
        }

        const hashed = await bcrypt.hash(newPass, 10);
        await pool.execute('UPDATE users SET password = ? WHERE username = ?', [hashed, 'admin']);

        res.json({ success: true, message: 'تم تغيير كلمة السر بنجاح' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// ==========================================
// ⚙️ الخدمات
// ==========================================

// GET /services — جلب كل الخدمات
app.get('/services', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM services ORDER BY created_at ASC');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'خطأ في جلب الخدمات' });
    }
});

// POST /services — إضافة خدمة جديدة
// body: { name, price_normal, price_urgent }
app.post('/services', async (req, res) => {
    const { name, price_normal, price_urgent } = req.body;

    if (!name) return res.json({ success: false, message: 'يرجى إدخال اسم الخدمة' });

    try {
        const [result] = await pool.execute(
            'INSERT INTO services (name, price_normal, price_urgent) VALUES (?, ?, ?)',
            [name, price_normal || 0, price_urgent || 0]
        );
        res.json({ success: true, id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'خطأ في إضافة الخدمة' });
    }
});

// PUT /services/:id — تعديل خدمة (سعر / إخفاء / إظهار)
// body: { price_normal?, price_urgent?, visible? }
app.put('/services/:id', async (req, res) => {
    const { id } = req.params;
    const { price_normal, price_urgent, visible } = req.body;

    try {
        const fields = [];
        const values = [];

        if (price_normal !== undefined) { fields.push('price_normal = ?'); values.push(price_normal); }
        if (price_urgent !== undefined) { fields.push('price_urgent = ?'); values.push(price_urgent); }
        if (visible      !== undefined) { fields.push('visible = ?');      values.push(visible);      }

        if (fields.length === 0) return res.json({ success: false, message: 'لا يوجد شيء للتعديل' });

        values.push(id);
        await pool.execute(`UPDATE services SET ${fields.join(', ')} WHERE id = ?`, values);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'خطأ في تعديل الخدمة' });
    }
});

// DELETE /services/:id — حذف خدمة
app.delete('/services/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.execute('DELETE FROM services WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'خطأ في حذف الخدمة' });
    }
});

// ==========================================
// 📋 الطلبات
// ==========================================

// GET /orders — جلب كل الطلبات
app.get('/orders', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM orders ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'خطأ في جلب الطلبات' });
    }
});

// POST /orders — إضافة طلب جديد
// body: { name, mother_name, national_id, reg_no, property_no, region, service_type, urgency, price, payment_method }
app.post('/orders', async (req, res) => {
    const { name, mother_name, national_id, reg_no, property_no, region, service_type, urgency, price, payment_method } = req.body;

    if (!name) return res.json({ success: false, message: 'اسم العميل مطلوب' });

    try {
        const [result] = await pool.execute(
            `INSERT INTO orders 
             (name, mother_name, national_id, reg_no, property_no, region, service_type, urgency, price, payment_method) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, mother_name, national_id, reg_no, property_no, region, service_type, urgency || 'عادي', price || 0, payment_method]
        );
        res.json({ success: true, id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'خطأ في إضافة الطلب' });
    }
});

// DELETE /orders/:id — حذف طلب
app.delete('/orders/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.execute('DELETE FROM orders WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'خطأ في حذف الطلب' });
    }
});

// ==========================================
// 📊 الإحصائيات
// GET /stats
// ==========================================
app.get('/stats', async (req, res) => {
    try {
        // إجمالي الطلبات
        const [[{ total }]]   = await pool.execute('SELECT COUNT(*) as total FROM orders');

        // طلبات اليوم
        const [[{ today }]]   = await pool.execute(
            'SELECT COUNT(*) as today FROM orders WHERE DATE(created_at) = CURDATE()'
        );

        // الطلبات المستعجلة
        const [[{ urgent }]]  = await pool.execute(
            "SELECT COUNT(*) as urgent FROM orders WHERE urgency LIKE '%مستعجل%'"
        );

        // إجمالي الإيرادات
        const [[{ revenue }]] = await pool.execute('SELECT COALESCE(SUM(price), 0) as revenue FROM orders');

        res.json({
            totalOrders:   total,
            todayOrders:   today,
            urgentOrders:  urgent,
            totalRevenue:  revenue
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'خطأ في جلب الإحصائيات' });
    }
});

// ==========================================
// تشغيل السيرفر
// ==========================================
initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 السيرفر يعمل على البورت ${PORT}`);
    });
});
// ── Imports ───────────────────────────────────────────────────────────────────
import express from 'express';
import type { Request, Response } from 'express';
import { Pool } from 'pg';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

// multer handles multipart/form-data (file uploads) — install with:
//   npm install multer
//   npm install -D @types/multer
import multer from 'multer';

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));          // serve HTML/CSS/JS from project root

// ── Database connection pool ──────────────────────────────────────────────────
const pool = new Pool({
    user:     'postgres',
    host:     'localhost',
    database: 'Palouse_properties',
    password: 'admin',
    port:     5432,
});

// ── File upload (multer) ──────────────────────────────────────────────────────
// Photos are stored in ./property-photos/ at the project root.
// Express serves them as static files so the browser can load them via /property-photos/filename.jpg
const UPLOAD_DIR = path.join('.', 'property-photos');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use('/property-photos', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        // unique name: timestamp + original extension
        const ext  = path.extname(file.originalname).toLowerCase();
        const name = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`;
        cb(null, name);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },         // 10 MB per file
    fileFilter: (_req, file, cb) => {
        cb(null, file.mimetype.startsWith('image/')); // images only
    },
});

// ── Type definitions ──────────────────────────────────────────────────────────
interface MaintenanceRequest {
    ticketID:      string;
    firstName:     string;
    lastName:      string;
    email:         string;
    phone:         string;
    address:       string;
    unit?:         string;
    category:      string;
    description:   string;
    preferredTime?: string;
}

interface PropertyRow {
    id:                number;
    address:           string;
    type:              string;
    beds:              number;
    baths:             number | null;
    sqft:              number | null;
    price:             number;
    available:         boolean;
    description:       string | null;
    primary_image_url: string | null;
    photo_count:       number;
}

// ════════════════════════════════════════════════════════════════════════════════
//  PUBLIC ROUTES
// ════════════════════════════════════════════════════════════════════════════════

// ── GET /api/properties ───────────────────────────────────────────────────────
// Query params (all optional): location, type, beds, maxPrice
app.get('/api/properties', async (req: Request, res: Response) => {
    try {
        const location    = req.query['location']  as string | undefined;
        const type        = req.query['type']       as string | undefined;
        const bedsRaw     = req.query['beds']       as string | undefined;
        const maxPriceRaw = req.query['maxPrice']   as string | undefined;

        const conditions: string[]          = [];
        const values:     (string|number)[] = [];
        let idx = 1;

        if (location) {
            conditions.push(`p.address ILIKE $${idx++}`);
            values.push(`%${location}%`);
        }
        if (type) {
            conditions.push(`p.type = $${idx++}`);
            values.push(type);
        }
        if (bedsRaw !== undefined && bedsRaw !== '') {
            const beds = parseInt(bedsRaw, 10);
            if (!isNaN(beds)) {
                conditions.push(beds >= 4 ? `p.beds >= $${idx++}` : `p.beds = $${idx++}`);
                values.push(beds >= 4 ? 4 : beds);
            }
        }
        if (maxPriceRaw) {
            const maxPrice = parseFloat(maxPriceRaw);
            if (!isNaN(maxPrice)) {
                conditions.push(`p.price <= $${idx++}`);
                values.push(maxPrice);
            }
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const sql = `
            SELECT
                p.id, p.address, p.type, p.beds, p.baths, p.sqft,
                p.price, p.available, p.description,
                (
                    SELECT pi.image_url FROM property_images pi
                    WHERE pi.property_id = p.id
                    ORDER BY pi.is_primary DESC, pi.sort_order ASC
                    LIMIT 1
                ) AS primary_image_url,
                (
                    SELECT COUNT(*)::int FROM property_images pi
                    WHERE pi.property_id = p.id
                ) AS photo_count
            FROM properties p
            ${where}
            ORDER BY p.available DESC, p.price ASC
        `;

        const result = await pool.query<PropertyRow>(sql, values);
        res.json({ success: true, properties: result.rows });

    } catch (err) {
        console.error('GET /api/properties error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch properties.' });
    }
});

// ── POST /submit-maintenance ──────────────────────────────────────────────────
app.post('/submit-maintenance', async (req: Request, res: Response) => {
    try {
        const data: MaintenanceRequest = req.body;

        const result = await pool.query(
            `INSERT INTO maintenance_form
             (ticket_id, firstName, lastName, email, phone, address, unit, catagory, description, preferred_time)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING *`,
            [
                data.ticketID,
                data.firstName,
                data.lastName,
                data.email,
                data.phone,
                data.address,
                data.unit         || null,
                data.category,
                data.description,
                data.preferredTime || null,
            ]
        );

        res.json({ success: true, data: result.rows[0] });

    } catch (err) {
        console.error('POST /submit-maintenance error:', err);
        res.status(500).json({ success: false });
    }
});

// ════════════════════════════════════════════════════════════════════════════════
//  ADMIN ROUTES  (prefix /admin)
//  NOTE: In production protect these with session/JWT middleware.
//        For now admin.html handles the login gate client-side.
// ════════════════════════════════════════════════════════════════════════════════

// ── GET /admin/maintenance ────────────────────────────────────────────────────
// Returns all maintenance tickets newest-first.
app.get('/admin/maintenance', async (_req: Request, res: Response) => {
    try {
        const result = await pool.query(`
            SELECT
                id, ticket_id,
                firstName, lastName,
                email, phone,
                address, unit,
                catagory, description, preferred_time,
                COALESCE(status, 'open') AS status,
                submitted_at
            FROM maintenance_form
            ORDER BY submitted_at DESC
        `);
        res.json({ success: true, tickets: result.rows });
    } catch (err) {
        console.error('GET /admin/maintenance error:', err);
        res.status(500).json({ success: false, error: 'Failed to load tickets.' });
    }
});

// ── PATCH /admin/maintenance/:id/status ──────────────────────────────────────
// Body: { status: 'open' | 'in_progress' | 'resolved' }
app.patch('/admin/maintenance/:id/status', async (req: Request, res: Response) => {
    try {
        const { id }     = req.params as { id: string };
        const { status } = req.body   as { status: string };

        const allowed = ['open', 'in_progress', 'resolved'];
        if (!allowed.includes(status)) {
            res.status(400).json({ success: false, error: 'Invalid status value.' });
            return;
        }

        await pool.query(
            `UPDATE maintenance_form SET status = $1 WHERE id = $2`,
            [status, parseInt(id, 10)]
        );

        res.json({ success: true });

    } catch (err) {
        console.error('PATCH /admin/maintenance/:id/status error:', err);
        res.status(500).json({ success: false, error: 'Failed to update status.' });
    }
});

// ── DELETE /admin/maintenance/:id ─────────────────────────────────────────────
app.delete('/admin/maintenance/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params as { id: string };
        await pool.query(`DELETE FROM maintenance_form WHERE id = $1`, [parseInt(id, 10)]);
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /admin/maintenance/:id error:', err);
        res.status(500).json({ success: false, error: 'Failed to delete ticket.' });
    }
});

// ── POST /admin/properties ────────────────────────────────────────────────────
// Accepts multipart/form-data with property fields + photo files.
app.post(
    '/admin/properties',
    upload.array('photos', 20),
    async (req: Request, res: Response) => {
        try {
            const b = req.body as {
                address:         string;
                type:            string;
                price:           string;
                beds:            string;
                baths?:          string;
                sqft?:           string;
                available?:      string;
                available_date?: string;
                pet_friendly?:   string;
                parking?:        string;
                laundry?:        string;
                description?:    string;
                primary_index?:  string;
            };

            if (!b.address || !b.type || !b.price || b.beds === undefined) {
                res.status(400).json({ success: false, error: 'Missing required fields.' });
                return;
            }

            // Insert property
            const propResult = await pool.query(
                `INSERT INTO properties
                 (address, type, price, beds, baths, sqft,
                  available, available_date, pet_friendly, parking, laundry, description)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                 RETURNING id`,
                [
                    b.address,
                    b.type,
                    parseFloat(b.price),
                    parseInt(b.beds, 10),
                    b.baths         ? parseFloat(b.baths)  : null,
                    b.sqft          ? parseInt(b.sqft, 10)  : null,
                    b.available     === 'true',
                    b.available_date || null,
                    b.pet_friendly  === 'true',
                    b.parking       === 'true',
                    b.laundry       || null,
                    b.description   || null,
                ]
            );

            const propertyId = (propResult.rows[0] as { id: number }).id;
            const primaryIdx = parseInt(b.primary_index ?? '0', 10) || 0;
            const files      = (req.files ?? []) as Express.Multer.File[];

            // Insert one image row per uploaded file
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!file) continue;
                const imageUrl  = `/property-photos/${file.filename}`;
                const isPrimary = (i === primaryIdx);

                await pool.query(
                    `INSERT INTO property_images (property_id, image_url, is_primary, sort_order)
                     VALUES ($1, $2, $3, $4)`,
                    [propertyId, imageUrl, isPrimary, i]
                );
            }

            res.json({ success: true, id: propertyId });

        } catch (err) {
            console.error('POST /admin/properties error:', err);
            res.status(500).json({ success: false, error: 'Failed to create property.' });
        }
    }
);

// ── PATCH /admin/properties/:id/availability ──────────────────────────────────
// Body: { available: boolean }
app.patch('/admin/properties/:id/availability', async (req: Request, res: Response) => {
    try {
        const { id }        = req.params as { id: string };
        const { available } = req.body   as { available: boolean };

        await pool.query(
            `UPDATE properties SET available = $1, updated_at = NOW() WHERE id = $2`,
            [available, parseInt(id, 10)]
        );

        res.json({ success: true });

    } catch (err) {
        console.error('PATCH /admin/properties/:id/availability error:', err);
        res.status(500).json({ success: false, error: 'Failed to update availability.' });
    }
});

// ── DELETE /admin/properties/:id ──────────────────────────────────────────────
// Deletes the property row (CASCADE removes property_images) + physical files.
app.delete('/admin/properties/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params as { id: string };
        const pid    = parseInt(id, 10);

        // Grab image paths before deleting so we can clean up disk files
        const imgResult = await pool.query<{ image_url: string }>(
            `SELECT image_url FROM property_images WHERE property_id = $1`,
            [pid]
        );

        await pool.query(`DELETE FROM properties WHERE id = $1`, [pid]);

        // Remove files from disk (best-effort, don't fail if already gone)
        for (const row of imgResult.rows) {
            const filePath = path.join('.', row.image_url);
            fs.unlink(filePath, err => {
                if (err) console.warn('Could not delete file:', filePath, err.message);
            });
        }

        res.json({ success: true });

    } catch (err) {
        console.error('DELETE /admin/properties/:id error:', err);
        res.status(500).json({ success: false, error: 'Failed to delete property.' });
    }
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(3000, () => {
    console.log('Server running → http://localhost:3000');
    console.log('Admin portal  → http://localhost:3000/admin.html');
});
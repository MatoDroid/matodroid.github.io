import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import fs from 'fs';
import path from "path";
dotenv.config();



const app = express();
const PORT = process.env.PORT || 3000;


// API kľúče a JSONBin konfiguračné údaje
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY;
const MENU_BIN_ID = process.env.JSONBIN_MENU_BIN_ID;
const ORDERS_BIN_ID = process.env.JSONBIN_ORDERS_BIN_ID;
const PAIDORDERS_BIN_ID = process.env.JSONBIN_PAIDORDERS_BIN_ID;
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "password";
const ENV_PATH = '.env';
const JSONBIN_URL = 'https://api.jsonbin.io/v3/b';

// Middleware
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
//    console.log("Prijaté hlavičky:", req.headers);
    next();
});

// Prihlásenie
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    const userEnv = process.env[`USER_${username.toUpperCase()}`];
    if (!userEnv) {
        return res.status(401).json({ success: false, message: "Neplatné prihlasovacie údaje" });
    }

    const [hashedPassword, role] = userEnv.split(",");
    bcrypt.compare(password, hashedPassword, (err, isMatch) => {
        if (err || !isMatch) {
            return res.status(401).json({ success: false, message: "Neplatné prihlasovacie údaje" });
        }

        const token = jwt.sign({ username, role }, JWT_SECRET, { expiresIn: "1h" });
        res.json({ success: true, token, role }); // Uistite sa, že vrátiate `role`
    });
});


app.post("/logout", (req, res) => {
    res.clearCookie("authToken"); // Vymaže token (ak používate cookies)
    res.redirect("/POS/login.html"); // Presmerovanie na login
});

app.get('/verify-token', authenticateToken, (req, res) => {
    res.json(req.user);
});




// Middleware na overenie JWT tokenu
function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
//    console.log("Hlavička Authorization:", authHeader);

    const token = authHeader && authHeader.split(" ")[1];
//    console.log("Token extrahovaný z hlavičky:", token);

    if (!token) {
        return res.status(401).json({ message: "Token nebol poskytnutý." });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error("Chyba pri overovaní tokenu:", err.message);
            return res.status(403).json({ message: "Neplatný alebo expirovaný token." });
        }

  //      console.log("Údaje z tokenu:", user);
        req.user = user;
        next();
    });
}







// Chránený endpoint pre admin.html (iba pre adminov)
const __dirname = path.resolve();
app.get("/admin.html", authenticateToken, (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Nemáte oprávnenie na prístup k tejto stránke." });
    }
    res.sendFile(path.join(__dirname, "/POS/admin.html"));
});

// Chránený endpoint pre pos.html (iba pre používateľov s rolou 'user')
app.get("/pos.html", authenticateToken, (req, res) => {
    if (req.user.role !== "user") {
        return res.status(403).json({ message: "Nemáte oprávnenie na prístup k tejto stránke." });
    }
    res.sendFile(path.join(__dirname, "/POS/pos.html"));
});







app.post('/add-user', async (req, res) => {
    try {
        const { username, password, role } = req.body;

        if (!username || !password || !role) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Pridanie do .env
        const envData = fs.readFileSync(ENV_PATH, 'utf-8');
        const newEnvData = `${envData}\nUSER_${username.toUpperCase()}=${hashedPassword},${role}`;
        fs.writeFileSync(ENV_PATH, newEnvData);

        res.status(201).json({ message: 'Používateľ úspešne pridaný!' });
    } catch (error) {
        console.error('Chyba pri pridávaní používateľa:', error);
        res.status(500).json({ error: 'Chyba servera' });
    }
});


// Endpoint: Načítanie menu
app.get('/menu', async (req, res) => {
    try {
        const response = await fetch(`${JSONBIN_URL}/${MENU_BIN_ID}`, {
            headers: { 'X-Master-Key': JSONBIN_API_KEY },
        });
        const data = await response.json();
        res.json(data.record);
    } catch (error) {
        console.error('Chyba pri načítaní menu:', error);
        res.status(500).json({ error: 'Chyba pri načítaní menu' });
    }
});

// Endpoint: Ukladanie menu
app.post('/menu', async (req, res) => {
    try {
        const updatedMenu = req.body; // Dáta od klienta (nové menu)

        // Validácia dát
        if (!updatedMenu || typeof updatedMenu !== 'object') {
            return res.status(400).json({ error: 'Nesprávny formát dát' });
        }

        const response = await fetch(`${JSONBIN_URL}/${MENU_BIN_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': JSONBIN_API_KEY,
            },
            body: JSON.stringify(updatedMenu),
        });

        if (!response.ok) {
            const errorDetails = await response.text();
            console.error('Chyba pri ukladaní menu na JSONBin:', errorDetails);
            return res.status(500).json({ error: 'Chyba pri ukladaní menu na JSONBin', details: errorDetails });
        }

        res.json(await response.json());
    } catch (error) {
        console.error('Chyba pri ukladaní menu:', error);
        res.status(500).json({ error: 'Chyba pri ukladaní menu' });
    }
});

// Endpoint: Načítanie objednávok
app.get('/orders', async (req, res) => {
    try {
        const response = await fetch(`${JSONBIN_URL}/${ORDERS_BIN_ID}`, {
            headers: { 'X-Master-Key': JSONBIN_API_KEY },
        });
        const data = await response.json();
        res.json(data.record || {});
    } catch (error) {
        console.error('Chyba pri načítaní objednávok:', error);
        res.status(500).json({ error: 'Chyba pri načítaní objednávok' });
    }
});

// Endpoint: Ukladanie objednávok
app.post('/orders', async (req, res) => {
    try {
        let dataToSave = req.body;

        // Spracovanie prázdnych objednávok
        if (dataToSave.empty) {
            dataToSave = { empty: true }; // Ak `empty: true`, uloží sa prázdny objekt
        } else {
            // Filtrovanie neplatných položiek
            dataToSave = Object.fromEntries(
                Object.entries(dataToSave).filter(([_, value]) => value && Object.keys(value.items || {}).length > 0)
            );
        }

        const response = await fetch(`${JSONBIN_URL}/${ORDERS_BIN_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': JSONBIN_API_KEY,
            },
            body: JSON.stringify(dataToSave),
        });

        res.json(await response.json());
    } catch (error) {
        console.error('Chyba pri ukladaní objednávok:', error);
        res.status(500).json({ error: 'Chyba pri ukladaní objednávok' });
    }
});

// Zaplatené objednávky
app.post('/orders/paid', async (req, res) => {
    try {
        const paidOrders = req.body; // Dáta od klienta
        const response = await fetch(`${JSONBIN_URL}/${PAIDORDERS_BIN_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': JSONBIN_API_KEY,
            },
            body: JSON.stringify(paidOrders),
        });

        res.json(await response.json());
    } catch (error) {
        console.error('Chyba pri ukladaní zaplatených objednávok:', error);
        res.status(500).json({ error: 'Chyba pri ukladaní zaplatených objednávok' });
    }
});


// Endpoint: Generovanie QR kódu
app.get('/generate-qr', async (req, res) => {
    const { amount, table } = req.query;
    const IBAN = 'SK8975000000000012345671';
    const beneficiaryName = 'Moje Meno';
    const dueDate = '20241231';
    const variableSymbol = table;

    const qrUrl = `https://api.freebysquare.sk/pay/v1/generate-png?size=400&color=3&transparent=true&amount=${amount}&currencyCode=EUR&dueDate=${dueDate}&variableSymbol=${variableSymbol}&iban=${IBAN}&beneficiaryName=${encodeURIComponent(beneficiaryName)}`;

    try {
        // Vytvoriť URL pre generovanie QR kódu
    const qrUrl = `https://api.freebysquare.sk/pay/v1/generate-png?size=400&color=3&transparent=true&amount=${amount}&currencyCode=EUR&dueDate=${dueDate}&variableSymbol=${variableSymbol}&iban=${IBAN}&beneficiaryName=${encodeURIComponent(beneficiaryName)}`;

        res.redirect(qrUrl); // Presmerovanie na URL s QR kódom
    } catch (error) {
        console.error('Chyba pri generovaní QR kódu:', error);
        res.status(500).json({ error: 'Chyba pri generovaní QR kódu' });
    }
});


// ================== IMPORT / EXPORT (ADMIN ONLY) ==================
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ message: "Len pre adminov." });
    }
    next();
}

function stringifyCSV(rows) {
    if (!rows || !rows.length) return "";
    const headers = Array.from(rows.reduce((set, o) => {
        Object.keys(o || {}).forEach(k => set.add(k));
        return set;
    }, new Set()));
    const esc = v => {
        if (v === null || v === undefined) return "";
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [headers.join(","), ...rows.map(o => headers.map(h => esc(o?.[h])).join(","))].join("\n");
}

function parseCSV(text) {
    const rows = [];
    let i = 0, field = "", row = [], inQ = false;
    const pushF = () => { row.push(field); field = ""; };
    const pushR = () => { rows.push(row); row = []; };
    while (i < text.length) {
        const c = text[i];
        if (inQ) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') inQ = false;
            else field += c;
        } else {
            if (c === '"') inQ = true;
            else if (c === ",") pushF();
            else if (c === "\r") {}
            else if (c === "\n") { pushF(); pushR(); }
            else field += c;
        }
        i++;
    }
    if (field.length || row.length) { pushF(); pushR(); }
    if (!rows.length) return { headers: [], data: [] };
    const headers = rows[0];
    const data = rows.slice(1).map(r => Object.fromEntries(headers.map((h, idx) => [h, r[idx] ?? ""])));
    return { headers, data };
}

function normalizeEntity(entity, o) {
    const toBool = v => ["1", "true", "yes"].includes(String(v).toLowerCase());
    const toNum = v => (v === "" || v == null ? null : Number(v));
    const trim = v => (v == null ? "" : String(v).trim());

    if (entity === "tables")
        return { id: trim(o.id), name: trim(o.name ?? o.nazov), capacity: toNum(o.capacity), active: toBool(o.active), order: toNum(o.order) };
    if (entity === "categories")
        return { id: trim(o.id), name: trim(o.name ?? o.nazov), order: toNum(o.order), active: toBool(o.active) };
    if (entity === "items")
        return { id: trim(o.id), category: trim(o.category ?? o.categoryId), name: trim(o.name ?? o.nazov), price: toNum(o.price ?? o.cena), vat: toNum(o.vat ?? o.dph), sku: trim(o.sku ?? o.kod), active: toBool(o.active) };
    return o;
}

function mergeById(existingArr, importedArr, entity) {
    const byId = new Map((existingArr || []).map(x => [String(x.id), x]));
    for (const obj of importedArr) {
        const n = normalizeEntity(entity, obj);
        if (!n.id) n.id = `${entity}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
        byId.set(String(n.id), { ...byId.get(String(n.id)), ...n });
    }
    return Array.from(byId.values());
}

async function loadMenu() {
    const r = await fetch(`${JSONBIN_URL}/${MENU_BIN_ID}`, {
        headers: { "X-Master-Key": JSONBIN_API_KEY },
    });
    const j = await r.json();
    return j?.record ?? j;
}

async function saveMenu(menu) {
    const r = await fetch(`${JSONBIN_URL}/${MENU_BIN_ID}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "X-Master-Key": JSONBIN_API_KEY,
        },
        body: JSON.stringify(menu),
    });
    return r.json();
}

// --- EXPORT ---
app.get("/export/:entity", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { entity } = req.params;
        const format = (req.query.format || "csv").toLowerCase();
        if (!["tables", "categories", "items"].includes(entity))
            return res.status(400).json({ error: "Neznáma entita." });

        const menu = await loadMenu();
        const data = entity === "tables" ? menu.tables : entity === "categories" ? menu.categories : menu.menuItems;
        if (format === "json") {
            res.setHeader("Content-Type", "application/json");
            return res.send(JSON.stringify(data, null, 2));
        }
        res.setHeader("Content-Type", "text/csv");
        return res.send(stringifyCSV(data));
    } catch (e) {
        console.error("Export error:", e);
        res.status(500).json({ error: "Chyba pri exporte." });
    }
});

// --- IMPORT ---
app.post("/import/:entity", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { entity } = req.params;
        const format = (req.query.format || req.body.format || "csv").toLowerCase();
        if (!["tables", "categories", "items"].includes(entity))
            return res.status(400).json({ error: "Neznáma entita." });

        const text = typeof req.body === "string" ? req.body : req.body?.data;
        let imported = [];

        if (format === "json") {
            imported = Array.isArray(req.body) ? req.body : req.body.data || [];
        } else {
            const parsed = parseCSV(text);
            imported = parsed.data;
        }

        const menu = await loadMenu();
        const merged = mergeById(
            entity === "tables" ? menu.tables : entity === "categories" ? menu.categories : menu.menuItems,
            imported,
            entity
        );

        if (entity === "tables") menu.tables = merged;
        if (entity === "categories") menu.categories = merged;
        if (entity === "items") menu.menuItems = merged;

        await saveMenu(menu);
        res.json({ ok: true, imported: imported.length });
    } catch (e) {
        console.error("Import error:", e);
        res.status(500).json({ error: "Chyba pri importe." });
    }
});

// Spustenie servera
app.listen(PORT, () => console.log(`Server beží na porte ${PORT}`));


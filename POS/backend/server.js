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

// Verzia API. Admin podľa nej pozná, či na serveri už beží opravené
// zlučovanie pri importe — staršia verzia by dáta ticho zničila,
// tak sa import v rozhraní zobrazí až od api >= 2.
app.get('/version', (req, res) => res.json({ api: 2 }));




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







// POZOR: tento endpoint bol verejný — ktokoľvek si cezeň vedel založiť
// admin účet a prevziať systém. Teraz vyžaduje platný token s rolou admin.
app.post('/add-user', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { username, password, role } = req.body;

        if (!username || !password || !role) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        if (!['admin', 'user'].includes(role)) {
            return res.status(400).json({ error: 'Neplatná rola.' });
        }
        // meno ide do názvu premennej v .env, musí byť bezpečné
        if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) {
            return res.status(400).json({ error: 'Meno smie obsahovať len písmená, číslice a podčiarkovník (3–32 znakov).' });
        }
        if (String(password).length < 8) {
            return res.status(400).json({ error: 'Heslo musí mať aspoň 8 znakov.' });
        }
        if (process.env[`USER_${username.toUpperCase()}`]) {
            return res.status(409).json({ error: 'Používateľ s týmto menom už existuje.' });
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

// Endpoint: Ukladanie menu — len pre adminov.
// Predtým mohol ktokoľvek prepísať celé menu vrátane cien a čísla účtu.
app.post('/menu', authenticateToken, requireAdmin, async (req, res) => {
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
// Číslo účtu sa už nedrží natvrdo v kóde — nastavuje sa v admin menu
// a ukladá spolu s menu (menu.payment).
app.get('/generate-qr', async (req, res) => {
    const { amount, table } = req.query;

    try {
        const menu = await loadMenu();
        const payment = (menu && menu.payment) || {};

        const iban = String(payment.iban || '').replace(/\s+/g, '').toUpperCase();
        const beneficiaryName = String(payment.beneficiaryName || '').trim();

        if (!iban) {
            return res.status(400).json({
                error: 'Nie je nastavené číslo účtu. Doplňte IBAN v admin menu (sekcia Platba).',
            });
        }

        // splatnosť "dnes" — pevný dátum v minulosti robil z každého QR prošlý doklad
        const dueDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        const params = new URLSearchParams({
            size: '400',
            color: '3',
            transparent: 'true',
            amount: String(amount ?? ''),
            currencyCode: 'EUR',
            dueDate,
            variableSymbol: String(table ?? ''),
            iban,
            beneficiaryName,
        });

        res.redirect(`https://api.freebysquare.sk/pay/v1/generate-png?${params.toString()}`);
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

// Prirodzený kľúč každej entity tak, ako ho používa aplikácia.
// Predtým sa všetko párovalo podľa poľa `id`, ktoré stoly ani položky nemajú —
// pri importe sa preto všetky záznamy zliali do jedného.
const ENTITY_KEY = { tables: "number", categories: "id", items: "name" };

function normalizeEntity(entity, o) {
    const toNum = v => (v === "" || v == null ? null : Number(v));
    const trim = v => (v == null ? "" : String(v).trim());

    if (entity === "tables")
        return { number: toNum(o.number ?? o.cislo), name: trim(o.name ?? o.nazov) };
    if (entity === "categories")
        return { id: trim(o.id), name: trim(o.name ?? o.nazov), priority: toNum(o.priority ?? o.priorita) ?? 99 };
    if (entity === "items")
        return { category: trim(o.category ?? o.categoryId ?? o.kategoria), name: trim(o.name ?? o.nazov), price: toNum(o.price ?? o.cena) };
    return o;
}

function mergeByKey(existingArr, importedArr, entity) {
    const key = ENTITY_KEY[entity];
    const map = new Map((existingArr || []).map(x => [String(x[key]), x]));
    let skipped = 0;

    for (const obj of importedArr) {
        const n = normalizeEntity(entity, obj);
        const k = n[key];

        // záznam bez kľúča sa nedá spárovať ani zmysluplne pridať
        if (k === "" || k === null || k === undefined || (typeof k === "number" && isNaN(k))) {
            skipped++;
            continue;
        }

        // existujúce polia (napr. staré id) zostávajú, importované ich prepíšu
        map.set(String(k), { ...map.get(String(k)), ...n });
    }

    return { merged: Array.from(map.values()), skipped };
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
        const existing = entity === "tables" ? menu.tables
                       : entity === "categories" ? menu.categories
                       : menu.menuItems;

        const { merged, skipped } = mergeByKey(existing || [], imported, entity);

        // poistka: import nikdy nesmie skončiť menším počtom záznamov, než bol pred ním
        if (merged.length < (existing || []).length) {
            return res.status(400).json({
                error: `Import zamietnutý: zo ${(existing || []).length} záznamov by zostalo ${merged.length}. ` +
                       `Skontrolujte, či súbor obsahuje stĺpec „${ENTITY_KEY[entity]}“.`,
            });
        }

        if (entity === "tables") menu.tables = merged;
        if (entity === "categories") menu.categories = merged;
        if (entity === "items") menu.menuItems = merged;

        await saveMenu(menu);
        res.json({ ok: true, imported: imported.length - skipped, skipped, total: merged.length });
    } catch (e) {
        console.error("Import error:", e);
        res.status(500).json({ error: "Chyba pri importe." });
    }
});

// Spustenie servera
app.listen(PORT, () => console.log(`Server beží na porte ${PORT}`));


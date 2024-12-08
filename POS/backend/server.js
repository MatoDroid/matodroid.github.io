import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// API kľúče a JSONBin konfiguračné údaje
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY;
const MENU_BIN_ID = process.env.JSONBIN_MENU_BIN_ID;
const ORDERS_BIN_ID = process.env.JSONBIN_ORDERS_BIN_ID;
const PAIDORDERS_BIN_ID = process.env.JSONBIN_PAIDORDERS_BIN_ID;
const JSONBIN_URL = 'https://api.jsonbin.io/v3/b';

// Middleware
app.use(cors());
app.use(express.json());

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

// Endpoint: Načítanie objednávok
app.get('/orders', async (req, res) => {
    try {
        const response = await fetch(`${JSONBIN_URL}/${ORDERS_BIN_ID}`, {
            headers: { 'X-Master-Key': JSONBIN_API_KEY },
        });

        if (!response.ok) {
            throw new Error('Chyba pri načítaní objednávok');
        }

        const data = await response.json();
        res.json(data.record || {}); // Vráti prázdny objekt, ak sú údaje prázdne
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
            dataToSave = {}; // Ak `empty: true`, uloží sa prázdny objekt
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

        if (!response.ok) {
            throw new Error('Chyba pri ukladaní objednávok');
        }

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

        if (!response.ok) {
            throw new Error('Chyba pri ukladaní zaplatených objednávok');
        }

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

    try {
        const qrUrl = `https://api.freebysquare.sk/pay/v1/generate-png?size=400&color=3&transparent=true&amount=${amount}&currencyCode=EUR&dueDate=${dueDate}&variableSymbol=${variableSymbol}&iban=${IBAN}&beneficiaryName=${encodeURIComponent(beneficiaryName)}`;

        res.redirect(qrUrl); // Presmerovanie na URL s QR kódom
    } catch (error) {
        console.error('Chyba pri generovaní QR kódu:', error);
        res.status(500).json({ error: 'Chyba pri generovaní QR kódu' });
    }
});

// Spustenie servera
app.listen(PORT, () => console.log(`Server beží na porte ${PORT}`));

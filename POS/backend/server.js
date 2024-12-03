const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// API kľúče a JSONBin konfiguračné údaje
const JSONBIN_API_KEY = '$2a$10$IjFgvnWw7GPM8c7XwMuwrOg9lOL5VBfRwBctn2lvMfgiNgOKrs6EO';
const ORDERS_BIN_ID = '674e18dcad19ca34f8d45308';
const MENU_BIN_ID = '674dbe2fe41b4d34e45e665b';
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
        const cleanedOrders = Object.fromEntries(
            Object.entries(req.body).filter(([_, value]) => value && Object.keys(value.items || {}).length > 0)
        );

        const response = await fetch(`${JSONBIN_URL}/${ORDERS_BIN_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': JSONBIN_API_KEY,
            },
            body: JSON.stringify(cleanedOrders),
        });

        res.json(await response.json());
    } catch (error) {
        console.error('Chyba pri ukladaní objednávok:', error);
        res.status(500).json({ error: 'Chyba pri ukladaní objednávok' });
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

    res.redirect(qrUrl);
});

// Spustenie servera
app.listen(PORT, () => console.log(`Server beží na porte ${PORT}`));

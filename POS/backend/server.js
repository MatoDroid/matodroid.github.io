const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// URL na obsluhu dát (bude dostupná pre frontend)
const API_URL = '/data';

// Cesta k JSON súboru
const DATA_PATH = path.join(__dirname, 'menu-data.json');

// Endpoint: Načítanie dát z menu-data.json
app.get(API_URL, (req, res) => {
    fs.readFile(DATA_PATH, 'utf8', (err, data) => {
        if (err) {
            console.error('Chyba pri čítaní dát:', err);
            return res.status(500).json({ message: 'Chyba pri čítaní dát' });
        }
        res.json(JSON.parse(data));
    });
});

// Endpoint: Aktualizácia dát v menu-data.json
app.post(API_URL, (req, res) => {
    const newData = req.body;

    fs.writeFile(DATA_PATH, JSON.stringify(newData, null, 2), 'utf8', (err) => {
        if (err) {
            console.error('Chyba pri ukladaní dát:', err);
            return res.status(500).json({ message: 'Chyba pri ukladaní dát' });
        }
        res.json({ message: 'Dáta boli úspešne uložené' });
    });
});

// Spustenie servera
app.listen(PORT, () => {
    console.log(`Server beží na porte ${PORT}`);
    console.log(`Endpoint na načítanie a aktualizáciu dát: http://localhost:${PORT}${API_URL}`);
});

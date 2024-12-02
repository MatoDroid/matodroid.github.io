const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// JSONBin.io detaily
const BIN_ID = '674dbe2fe41b4d34e45e665b'; // Vložte váš Bin ID
const API_KEY = '$2a$10$IjFgvnWw7GPM8c7XwMuwrOg9lOL5VBfRwBctn2lvMfgiNgOKrs6EO'; // Vložte váš API Key
const API_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

// Middleware
app.use(cors());
app.use(express.json());

// Endpoint: Načítanie dát
app.get('/data', async (req, res) => {
    try {
        const response = await axios.get(API_URL, {
            headers: { 'X-Master-Key': API_KEY },
        });
        res.json(response.data.record); // Posiela dáta späť na frontend
    } catch (error) {
        console.error('Chyba pri načítaní dát:', error.message);
        res.status(500).json({ message: 'Chyba pri načítaní dát' });
    }
});

// Endpoint: Aktualizácia dát
app.post('/data', async (req, res) => {
    const newData = req.body;

    try {
        await axios.put(API_URL, newData, {
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': API_KEY,
            },
        });
        res.json({ message: 'Dáta boli úspešne uložené' });
    } catch (error) {
        console.error('Chyba pri ukladaní dát:', error.message);
        res.status(500).json({ message: 'Chyba pri ukladaní dát' });
    }
});

// Spustenie servera
app.listen(PORT, () => {
    console.log(`Server beží na porte ${PORT}`);
    console.log(`Endpoint na načítanie a aktualizáciu dát: http://localhost:${PORT}/data`);
});

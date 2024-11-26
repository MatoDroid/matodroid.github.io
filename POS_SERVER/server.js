const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());
app.use(express.static('public')); // Ukladá HTML a frontendové súbory do zložky "public"

// Cesta k menu.json
const menuFile = './menu.json';

// Načítanie menu
app.get('/menu', (req, res) => {
    fs.readFile(menuFile, 'utf8', (err, data) => {
        if (err) {
            res.status(500).send({ error: 'Nemôžem načítať menu.' });
        } else {
            res.send(JSON.parse(data));
        }
    });
});

// Uloženie menu
app.post('/menu', (req, res) => {
    fs.writeFile(menuFile, JSON.stringify(req.body, null, 2), (err) => {
        if (err) {
            res.status(500).send({ error: 'Nemôžem uložiť menu.' });
        } else {
            res.send({ message: 'Menu uložené.' });
        }
    });
});

// Spustenie servera
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server beží na http://localhost:${PORT}`);
});

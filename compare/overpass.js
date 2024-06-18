const axios = require('axios');

// Definujte váš Overpass API dotaz
const overpassQuery = `
[out:csv("ref:minvskaddress","addr:street","addr:streetnumber","addr:conscriptionnumber","note")];
area(${id})->.searchArea;

(
node["addr:conscriptionnumber"](area.searchArea);
way["addr:conscriptionnumber"](area.searchArea);
relation["addr:conscriptionnumber"](area.searchArea);
);
out center;
`;

// URL pro Overpass API
const overpassUrl = 'https://overpass-api.de/api/interpreter';

// Parametry pro POST požadavek
const postData = `data=${encodeURIComponent(overpassQuery)}`;

// Konfigurace axios pro POST požadavek
const axiosConfig = {
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
};

// Odešlete dotaz na Overpass API
axios
  .post(overpassUrl, postData, axiosConfig)
  .then((response) => {
    // Zpracujte výsledek dotazu zde
    console.log(response.data);
  })
  .catch((error) => {
    console.error('Chyba při provádění dotazu na Overpass API:', error);
  });


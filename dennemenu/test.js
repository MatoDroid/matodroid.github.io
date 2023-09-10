const axios = require('axios');

// Definujte dotaz na Overpass Turbo API
const overpassQuery = `
[out:csv("ref:minvskaddress","addr:street","addr:streetnumber","addr:conscriptionnumber")];
area(3602382009)->.searchArea;

(
  node["addr:conscriptionnumber"](area.searchArea);
  way["addr:conscriptionnumber"](area.searchArea);
  relation["addr:conscriptionnumber"](area.searchArea);
);
out center;
`;

// URL Overpass Turbo API
const overpassApiUrl = 'https://overpass-api.de/api/interpreter';

// Nastavte POST dáta
const data = new URLSearchParams();
data.append('data', overpassQuery);

// Zadajte požiadavku na Overpass Turbo API
axios.post(overpassApiUrl, data)
  .then((response) => {
    // Spracujte odpoveď z Overpass Turbo API
    console.log(response.data);
  })
  .catch((error) => {
    console.error('Chyba pri komunikácii s Overpass Turbo API:', error);
  });

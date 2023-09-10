// Import knihovny axios pro provádění HTTP požadavků
const axios = require('axios');

// Funkce pro získání ID oblasti na základě názvu
async function ziskejIDOblasti(nazevOblasti) {
  try {
    // Proveďte dotaz na Overpass API
    const odpoved = await axios.get(`https://overpass-api.de/api/interpreter?data=[out:json];area[name="${nazevOblasti}"];out;`);

    // Zkontrolujte, zda je odpověď platná
    if (odpoved.status === 200) {
      const data = odpoved.data;
      if (data && data.elements && data.elements.length > 0) {
        // Získání ID prvního prvku (pokud existuje)
        const idOblasti = data.elements[0].id;
        return idOblasti;
      } else {
        console.error('Oblast s zadaným názvem nebyla nalezena.');
        return null;
      }
    } else {
      console.error('Chyba při získávání dat z Overpass API.');
      return null;
    }
  } catch (chyba) {
    console.error('Při provádění HTTP požadavku došlo k chybě:', chyba);
    return null;
  }
}

// Příklad použití funkce
const nazevOblasti = 'Košice'; // Nahraďte názvem oblasti, který chcete najít
ziskejIDOblasti(nazevOblasti)
  .then(idOblasti => {
    if (idOblasti) {
      console.log(`ID oblasti "${nazevOblasti}" je ${idOblasti}.`);
    } else {
      console.log('Nepodařilo se nalézt ID oblasti.');
    }
  })
  .catch(chyba => {
    console.error('Došlo k chybě:', chyba);
  });

import fetch from 'node-fetch';
const fs = require('fs');

const oldFilePath = 'osm/old.geojson';
const newURL = 'http://www.example.com/new.geojson';

fetch(newURL)
  .then(response => response.json())
  .then(newData => {
    const oldData = JSON.parse(fs.readFileSync(oldFilePath));

    // Porovnanie dát a vytvorenie GeoJSON s rozdielmi

    const diffGeoJSON = {
      type: 'FeatureCollection',
      features: differences.map(diff => {
        const feature = diff.feature;
        const properties = { type: diff.type };
        if (diff.type === 'Modified') {
          properties.oldFeature = diff.oldFeature;
        }
        return {
          type: 'Feature',
          geometry: feature.geometry,
          properties: properties
        };
      })
    };

    // Uloženie rozdielov do differences.geojson súboru
    fs.writeFileSync('differences.geojson', JSON.stringify(diffGeoJSON, null, 2));
    console.log('Porovnanie dokončené. Nájdené rozdiely boli uložené do differences.geojson súboru.');

    // Nahrať nový súbor ako old.geojson
    fs.writeFileSync(oldFilePath, JSON.stringify(newData, null, 2));
    console.log('Nový súbor new.geojson bol úspešne nahradený za old.geojson.');
  })
  .catch(error => {
    console.log('Chyba pri načítaní nového GeoJSON súboru: ' + error.message);
  });

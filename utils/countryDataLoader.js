const fs = require('fs');
const path = require('path');

const DEFAULT_COUNTRY_FILE = path.join(__dirname, '..', 'public', 'countries.txt');
const EXPECTED_COLUMN_COUNT = 8;

function stripWrappingQuotes(value) {
  if (typeof value !== 'string') {
    return value;
  }
  return value.replace(/\u0000/g, '').replace(/^"|"$/g, '');
}

function toNumber(value) {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function loadCountriesFromFile(filePath = DEFAULT_COUNTRY_FILE) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Country data file not found at ${filePath}`);
  }

  const rawContent = fs.readFileSync(filePath, 'utf8');
  const lines = rawContent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) {
    throw new Error('Country data file is empty');
  }

  const headerLine = stripWrappingQuotes(lines[0]);
  const headers = headerLine.split(',');

  if (headers.length !== EXPECTED_COLUMN_COUNT) {
    throw new Error(`Unexpected number of columns in header. Expected ${EXPECTED_COLUMN_COUNT}, received ${headers.length}`);
  }

  const countriesByIso = new Map();
  const duplicates = [];

  for (let i = 1; i < lines.length; i += 1) {
    const sanitizedLine = stripWrappingQuotes(lines[i]).trim();
    if (!sanitizedLine) {
      continue;
    }

    const values = sanitizedLine.split(',').map(value => stripWrappingQuotes(value).trim());

    if (values.length !== EXPECTED_COLUMN_COUNT) {
      throw new Error(
        `Unexpected number of columns on line ${i + 1}. Expected ${EXPECTED_COLUMN_COUNT}, received ${values.length}`
      );
    }

    const [name, isoCode, itucRightsRating, corruptionIndex, migrantWorkerPrevalence, wjpIndex, walkfreeSlaveryIndex, baseRiskScore] = values;

    if (!isoCode) {
      throw new Error(`Missing ISO code on line ${i + 1}`);
    }

    if (countriesByIso.has(isoCode)) {
      duplicates.push({
        isoCode,
        replaced: countriesByIso.get(isoCode).name,
        with: name
      });
    }

    countriesByIso.set(isoCode, {
      name,
      isoCode,
      itucRightsRating: toNumber(itucRightsRating),
      corruptionIndex: toNumber(corruptionIndex),
      migrantWorkerPrevalence: toNumber(migrantWorkerPrevalence),
      wjpIndex: toNumber(wjpIndex),
      walkfreeSlaveryIndex: toNumber(walkfreeSlaveryIndex),
      baseRiskScore: toNumber(baseRiskScore)
    });
  }

  return {
    countries: Array.from(countriesByIso.values()),
    duplicates
  };
}

module.exports = {
  loadCountriesFromFile
};
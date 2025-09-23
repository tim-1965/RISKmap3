const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { loadCountriesFromFile } = require('./utils/countryDataLoader');


const app = express();
const PORT = process.env.PORT || 3001;

// Risk calculation defaults (kept in sync with frontend RiskEngine)
const DEFAULT_WEIGHTS = [20, 20, 5, 10, 10];

let cachedFallbackData = null;

// Middleware
app.use(cors());
app.use(express.json());

function sanitizeIsoCode(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }
  return value.trim().toUpperCase();
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCountryRecord(record) {
  if (!record) {
    return null;
  }

  const isoCode = sanitizeIsoCode(record.isoCode);
  if (!isoCode) {
    return null;
  }

  return {
    name: record.name || '',
    isoCode,
    itucRightsRating: toNumber(record.itucRightsRating),
    corruptionIndex: toNumber(record.corruptionIndex),
    migrantWorkerPrevalence: toNumber(record.migrantWorkerPrevalence),
    wjpIndex: toNumber(record.wjpIndex),
    walkfreeSlaveryIndex: toNumber(record.walkfreeSlaveryIndex),
    baseRiskScore: toNumber(record.baseRiskScore)
  };
}

function getFallbackData() {
  if (!cachedFallbackData) {
    cachedFallbackData = loadCountriesFromFile();
  }
  return cachedFallbackData;
}

function getFallbackCountries() {
  const { countries } = getFallbackData();
  return countries.map(formatCountryRecord).filter(Boolean);
}

function getFallbackCountryByIso(isoCode) {
  const normalizedIso = sanitizeIsoCode(isoCode);
  if (!normalizedIso) {
    return null;
  }

  const { countries } = getFallbackData();
  const match = countries.find(country => sanitizeIsoCode(country.isoCode) === normalizedIso);
  return formatCountryRecord(match);
}

function isDatabaseConnected() {
  return mongoose.connection?.readyState === 1;
}

async function getAllCountries() {
  if (isDatabaseConnected()) {
    try {
      const docs = await Country.find({}).lean();
      const formatted = Array.isArray(docs) ? docs.map(formatCountryRecord).filter(Boolean) : [];
      if (formatted.length > 0) {
        return formatted;
      }
    } catch (error) {
      console.error('Failed to fetch countries from MongoDB, falling back to file data:', error);
    }
  }

  return getFallbackCountries();
}

async function getCountryByIso(isoCode) {
  const normalizedIso = sanitizeIsoCode(isoCode);
  if (!normalizedIso) {
    return null;
  }

  if (isDatabaseConnected()) {
    try {
      const doc = await Country.findOne({ isoCode: normalizedIso }).lean();
      const formatted = formatCountryRecord(doc);
      if (formatted) {
        return formatted;
      }
    } catch (error) {
      console.error(`Failed to fetch country ${normalizedIso} from MongoDB, attempting file fallback:`, error);
    }
  }

  return getFallbackCountryByIso(normalizedIso);
}

function sanitizeWeights(weights) {
  if (!Array.isArray(weights) || weights.length !== 5) {
    return [...DEFAULT_WEIGHTS];
  }

  const sanitized = weights.map(weight => {
    const parsed = Number(weight);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });

  return sanitized;
}

// Serve static assets for embedding
const publicDir = path.join(__dirname, 'public');
const componentsDir = path.join(publicDir, 'components');

app.use(express.static(publicDir));
app.use('/components', express.static(componentsDir));
app.use('/public/components', express.static(componentsDir));
console.log('Static asset directory configured at:', publicDir);
console.log('Static component directory configured at:', componentsDir);

// Serve Wix embed shell
const wixEmbedPath = path.join(__dirname, 'wix-embed.html');
app.get(['/wix-embed', '/wix-embed.html'], (req, res, next) => {
  res.sendFile(wixEmbedPath, err => {
    if (err) {
      next(err);
    }
  });
});

// Country schema
const countrySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  isoCode: { type: String, required: true, unique: true },
  itucRightsRating: { type: Number, required: true },
  corruptionIndex: { type: Number, required: true },
  migrantWorkerPrevalence: { type: Number, required: true },
  wjpIndex: { type: Number, required: true },
  walkfreeSlaveryIndex: { type: Number, required: true },
  baseRiskScore: { type: Number, required: true }
});

const Country = mongoose.model('Country', countrySchema);

// Connect to MongoDB - check multiple possible variable names
const mongoUri = process.env.MONGODB_URI || process.env.MongoDB_URI || process.env.Monogdb_URI || process.env.MONGO_URL || process.env.Mongo_URL || process.env.MongoURL || 'mongodb://localhost:27017/hrdd-risk';

console.log('Attempting to connect to MongoDB with URI:', mongoUri.replace(/\/\/.*@/, '//***:***@')); // Hide credentials in logs

mongoose.connect(mongoUri)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Routes

// Get all countries
app.get('/api/countries', async (req, res) => {
  try {
    const countries = await getAllCountries();
    res.json(countries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get country by ISO code
app.get('/api/countries/:isoCode', async (req, res) => {
  try {
    const country = await getCountryByIso(req.params.isoCode);
    if (!country) {
      return res.status(404).json({ error: 'Country not found' });
    }
    res.json(country);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Calculate weighted risk score
app.post('/api/calculate-risk', async (req, res) => {
  try {
    const { countryIsoCode, weights } = req.body;

    const isoCode = sanitizeIsoCode(countryIsoCode);
    if (!isoCode) {
      return res.status(400).json({ error: 'countryIsoCode is required' });
    }

    const country = await getCountryByIso(isoCode);
    if (!country) {
      return res.status(404).json({ error: 'Country not found' });
    }

    const sanitizedWeights = sanitizeWeights(weights);

    // Calculate weighted risk score
    // Weights order: ITUC_Rights_Rating, Corruption_Index_TI, ILO_Migrant_Worker_Prevalence, WJP_index, Walkfree_Slavery_Index
    const values = [
      country.itucRightsRating,
      country.corruptionIndex,
      country.migrantWorkerPrevalence,
      country.wjpIndex,
      country.walkfreeSlaveryIndex
    ];

    let weightedSum = 0;
    let totalWeight = 0;

    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      const weight = sanitizedWeights[i] || 0;
      if (value > 0 && weight > 0) { // Ignore zero values as specified
        weightedSum += value * weight;
        totalWeight += weight;
      }
    }

    const weightedRiskScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

    res.json({
      country: country.name,
      isoCode: country.isoCode,
      originalRiskScore: country.baseRiskScore,
      weightedRiskScore: Math.round(weightedRiskScore * 100) / 100,
      riskBand: getRiskBand(weightedRiskScore)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to determine risk band
function getRiskBand(score) {
  if (score >= 0 && score < 20) return 'Low';
  if (score >= 20 && score < 40) return 'Medium';
  if (score >= 40 && score < 60) return 'Medium High';
  if (score >= 60 && score < 80) return 'High';
  if (score >= 80) return 'Very High';
  return 'Unknown';
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test route to verify app is working
app.get('/', (req, res) => {
  res.json({ 
    message: 'HRDD Risk API is running',
    mongoUri: process.env.Mongo_URL ? 'Mongo_URL found' : 'Mongo_URL not found',
    mongoDbUri: process.env.MongoDB_URI ? 'MongoDB_URI found' : 'MongoDB_URI not found',
    monogdbUri: process.env.Monogdb_URI ? 'Monogdb_URI found (typo)' : 'Monogdb_URI not found',
    port: PORT
  });
});

// Temporary data import route (remove after use)
app.get('/import-data', async (req, res) => {
  try {
    // Clear existing data
    await Country.deleteMany({});

    const { countries, duplicates } = loadCountriesFromFile();

    if (duplicates.length > 0) {
      console.warn('Duplicate ISO codes found in country data. Keeping last occurrence for each:', duplicates);
    }

    await Country.insertMany(countries);

    res.json({
      message: 'Data imported successfully!',
      count: countries.length,
      duplicatesSkipped: duplicates
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get('/debug-env', (req, res) => {
  res.json({
    hasMongoURL: !!process.env.MongoURL,
    hasMongoDBURI: !!process.env.MONGODB_URI,
    hasMongoDB_URI: !!process.env.MongoDB_URI,
    hasMonogdbURI: !!process.env.Monogdb_URI,
    hasMONGO_URL: !!process.env.MONGO_URL,
    hasMongo_URL: !!process.env.Mongo_URL,
    nodeEnv: process.env.NODE_ENV,
    port: PORT,
    // Show first part of connection string (hide credentials)
    connectionString: mongoUri ? mongoUri.substring(0, 20) + '...' : 'none'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
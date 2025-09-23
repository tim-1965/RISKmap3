const mongoose = require('mongoose');
require('dotenv').config();

const { loadCountriesFromFile } = require('../utils/countryDataLoader');

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

async function importData() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrdd-risk';

  try {
    // Connect to MongoDB
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Clear existing data
    await Country.deleteMany({});
    console.log('Cleared existing data');

    const { countries, duplicates } = loadCountriesFromFile();

    if (duplicates.length > 0) {
      console.warn('Duplicate ISO codes found in country data. Keeping last occurrence for each:', duplicates);
    }

    // Insert data
    await Country.insertMany(countries);
    console.log(`Imported ${countries.length} countries`);

    if (duplicates.length > 0) {
      console.log(`Skipped ${duplicates.length} duplicate entr${duplicates.length === 1 ? 'y' : 'ies'} based on ISO codes.`);
    }
  } catch (error) {
    console.error('Error importing data:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

importData();
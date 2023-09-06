const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cron = require('node-cron');

const app = express();

// MongoDB Setup
mongoose.connect('mongodb://localhost/currency_exchange', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;

db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// MongoDB Schema
const exchangeRateSchema = new mongoose.Schema({
  baseCurrency: String,
  lastUpdated: Date,
  rates: {
    type: Map,
    of: Number,
  },
});

const ExchangeRate = mongoose.model('ExchangeRate', exchangeRateSchema);

// Function to fetch and update exchange rate data
async function updateExchangeRates() {
  try {
    // Fetch exchange rate data from Coinbase API
    const response = await axios.get('https://api.coinbase.com/v2/exchange-rates?currency=USD');
    const data = response.data.data.rates;

    // Update exchange rate data in the database
    const baseCurrency = 'crypto'; // Assuming crypto is the base currency
    const lastUpdated = new Date();
    await ExchangeRate.findOneAndUpdate(
      { baseCurrency: baseCurrency },
      { lastUpdated: lastUpdated, rates: data },
      { upsert: true }
    );

    console.log('Exchange rates updated.');
  } catch (error) {
    console.error('Failed to update exchange rates:', error);
  }
}

// Schedule the updateExchangeRates function to run every hour (adjust the schedule as needed)
cron.schedule('0 * * * *', updateExchangeRates);

// Endpoint to get exchange rates
app.get('/exchange-rates', async (req, res) => {
  const base = req.query.base;

  try {
    // Find exchange rate data in the database
    const exchangeRate = await ExchangeRate.findOne({ baseCurrency: base });

    if (exchangeRate) {
      res.json(exchangeRate.rates);
    } else {
      res.status(404).json({ error: 'Exchange rates not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch exchange rates' });
  }
});

// Endpoint to get historical exchange rates
app.get('/historical-rates', async (req, res) => {
  const baseCurrency = req.query.base_currency;
  const targetCurrency = req.query.target_currency;
  const startTime = parseInt(req.query.start);
  const endTime = parseInt(req.query.end);

  try {
    // Find exchange rate data for the base currency in the database
    const baseCurrencyData = await ExchangeRate.findOne({
      baseCurrency: baseCurrency,
      lastUpdated: { $gte: new Date(startTime), $lte: new Date(endTime) },
    });

    if (!baseCurrencyData) {
      return res.status(404).json({ error: 'Base currency data not found for the specified time period' });
    }

    // Extract exchange rates for the target currency over time
    const historicalRates = {};
    for (const [timestamp, rates] of baseCurrencyData.rates.entries()) {
      if (rates.hasOwnProperty(targetCurrency)) {
        historicalRates[timestamp] = rates[targetCurrency];
      }
    }

    res.json(historicalRates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch historical rates' });
  }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

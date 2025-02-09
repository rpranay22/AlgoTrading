const express = require('express');
const router = express.Router();
const tradingService = require('../services/tradingService');
const upstoxService = require('../services/upstoxService');
const Trade = require('../models/Trade');
const logger = require('../utils/logger');
const tradeService = require('../services/tradeService');

router.get('/status', async (req, res) => {
  try {
    const trades = await Trade.findAll({
      where: { status: 'OPEN' }
    });
    res.json(trades);
  } catch (error) {
    logger.error('Error fetching trades:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/login', (req, res) => {
  logger.info('Redirecting to Upstox login page');
  res.redirect(upstoxService.loginUrl);
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  
  // If there's no code, show a basic page with login link
  if (!code) {
    res.send(`
      <html>
        <head>
          <title>Algo Trading App</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 40px;
              line-height: 1.6;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
            }
            .button {
              display: inline-block;
              padding: 10px 20px;
              background-color: #007bff;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              margin-top: 20px;
            }
            .button:hover {
              background-color: #0056b3;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Welcome to Algo Trading Application</h1>
            <p>To start trading, please authenticate with Upstox:</p>
            <a href="/api/login" class="button">Login with Upstox</a>
          </div>
        </body>
      </html>
    `);
    return;
  }

  // If there is a code, process it
  try {
    logger.info('Processing authentication code');
    await upstoxService.setAccessToken(code);
    
    // Render success page
    res.send(`
      <html>
        <head>
          <title>Authentication Successful</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 40px;
              line-height: 1.6;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
            }
            .success {
              color: #28a745;
              padding: 20px;
              border: 1px solid #28a745;
              border-radius: 5px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Authentication Successful</h1>
            <div class="success">
              <p>You have successfully authenticated with Upstox.</p>
              <p>You can now close this window and start trading.</p>
            </div>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    logger.error('Authentication error:', { error });
    
    // Render error page
    res.status(500).send(`
      <html>
        <head>
          <title>Authentication Failed</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 40px;
              line-height: 1.6;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
            }
            .error {
              color: #dc3545;
              padding: 20px;
              border: 1px solid #dc3545;
              border-radius: 5px;
              margin: 20px 0;
            }
            .button {
              display: inline-block;
              padding: 10px 20px;
              background-color: #007bff;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Authentication Failed</h1>
            <div class="error">
              <p>There was an error during authentication:</p>
              <p>${error.message}</p>
            </div>
            <a href="/api/login" class="button">Try Again</a>
          </div>
        </body>
      </html>
    `);
  }
});

// Manual trading controls
router.post('/trading/start', async (req, res) => {
  try {
    const settings = req.body;
    await tradingService.startTradingWithSettings(settings);
    res.json({ message: 'Trading started successfully' });
  } catch (error) {
    logger.error('Error starting trading:', error);
    res.status(500).json({ error: 'Failed to start trading' });
  }
});

router.post('/trading/stop', async (req, res) => {
  try {
    await tradingService.squareOffAllPositions();
    res.json({ message: 'All positions squared off successfully' });
  } catch (error) {
    logger.error('Error stopping trading:', error);
    res.status(500).json({ error: 'Failed to stop trading' });
  }
});

// Get current positions and status
router.get('/trading/positions', async (req, res) => {
  try {
    const positions = await upstoxService.getPositions();
    res.json(positions);
  } catch (error) {
    logger.error('Error fetching positions:', error);
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

router.get('/trading/banknifty', async (req, res) => {
  try {
    const price = await upstoxService.getLTP();
    res.json({ price });
  } catch (error) {
    logger.error('Error fetching Banknifty price:', error);
    res.status(500).json({ error: 'Failed to fetch Banknifty price' });
  }
});

// Test order placement
router.post('/trading/test-order', async (req, res) => {
  try {
    const result = await upstoxService.placeTestOrder();
    res.json({
      message: 'Test orders placed successfully',
      details: result
    });
  } catch (error) {
    logger.error('Error placing test orders:', error);
    res.status(500).json({
      error: 'Failed to place test orders',
      details: error.message,
      response: error.response?.data
    });
  }
});

// Add this new route
router.post('/trading/single-order', async (req, res) => {
  try {
    const result = await upstoxService.placeSingleOrder();
    res.json({
      message: 'Order placed successfully',
      details: result
    });
  } catch (error) {
    logger.error('Error placing order:', error);
    res.status(500).json({
      error: 'Failed to place order',
      details: error.message,
      response: error.response?.data
    });
  }
});

// Add these routes to your existing routes
router.get('/trades/history', async (req, res) => {
  try {
    const trades = await tradeService.getTradeHistory();
    res.json(trades);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/trades/pnl', async (req, res) => {
  try {
    const [dailyPnL, pnlTotals] = await Promise.all([
      tradeService.getDailyPnL(),
      tradeService.getTotalPnL()
    ]);
    res.json({ 
      dailyPnL,
      ...pnlTotals
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 
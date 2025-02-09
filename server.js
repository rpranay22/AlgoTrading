const express = require('express');
const schedule = require('node-schedule');
const tradingService = require('./services/tradingService');
const tradingRoutes = require('./routes/tradingRoutes');
const sequelize = require('./config/database');
const logger = require('./utils/logger');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const websocketService = require('./services/websocketService');
const webhookRoutes = require('./routes/webhookRoutes');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "http://localhost:3001",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket']
});

app.use(cors());

// Add middleware to parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount the routes
app.use('/api', tradingRoutes);
app.use('/webhook', webhookRoutes);

// Add a basic route to redirect to login
app.get('/', (req, res) => {
  res.redirect('/api/login');
});

// Schedule market opening tasks
schedule.scheduleJob('30 9 * * 1-5', async () => {
  try {
    await tradingService.startTradingDay();
  } catch (error) {
    logger.error('Error starting trading day:', error);
  }
});

// Schedule market closing tasks
schedule.scheduleJob('00 15 * * 1-5', async () => {
  try {
    await tradingService.squareOffAllPositions();
  } catch (error) {
    logger.error('Error squaring off positions:', error);
  }
});

// Debug Socket.IO connections with more detail
io.on('connection', (socket) => {
  console.log('=== New Client Connected ===');
  console.log('Socket ID:', socket.id);
  console.log('Total clients:', io.engine.clientsCount);
  
  // Send initial market data if available
  const currentMarketData = websocketService.getLastMarketData();
  if (currentMarketData) {
    socket.emit('marketData', currentMarketData);
  }
  
  socket.on('disconnect', (reason) => {
    console.log('=== Client Disconnected ===');
    console.log('Socket ID:', socket.id);
    console.log('Reason:', reason);
    console.log('Remaining clients:', io.engine.clientsCount - 1);
  });
});

// Forward market data with debug logging
websocketService.on('marketData', (data) => {
  console.log('=== Market Data Received ===');
  console.log('Data:', JSON.stringify(data, null, 2));
  console.log('Connected clients:', io.engine.clientsCount);
  
  if (io.engine.clientsCount > 0) {
    console.log('Broadcasting to clients...');
    io.emit('marketData', data);
    console.log('Broadcast complete');
  } else {
    console.log('No clients connected, skipping broadcast');
  }
});

// Log WebSocket service status periodically
setInterval(() => {
  console.log('WebSocket Status:', {
    isConnected: websocketService.isConnected,
    clientsCount: io.engine.clientsCount
  });
}, 5000);

// Add error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// Update the database sync
sequelize.sync({ force: false }) // Be careful! This will drop existing tables
  .then(() => {
    server.listen(process.env.PORT || 3000, () => {
      logger.info('Server started', { port: process.env.PORT || 3000 });
    });
  })
  .catch((error) => {
    logger.error('Database connection failed', { error: error.message });
    process.exit(1);
  }); 
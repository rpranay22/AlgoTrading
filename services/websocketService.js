const WebSocket = require('ws');
const protobuf = require('protobufjs');
const EventEmitter = require('events');
const logger = require('../utils/logger');
const path = require('path');
const Trade = require('../models/Trade');

class WebsocketService extends EventEmitter {
  constructor() {
    super();
    this.marketWs = null;
    this.orderWs = null;
    this.lastMarketData = null;
    this.protobufRoot = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  async initProtobuf() {
    try {
      this.protobufRoot = await protobuf.load(path.join(__dirname, 'MarketDataFeed.proto'));
      console.log('Protobuf initialized successfully');
    } catch (error) {
      console.error('Error initializing protobuf:', error);
      throw error;
    }
  }

  async connect(accessToken) {
    try {
      console.log('Initializing WebSocket connection with token:', accessToken.substring(0, 10) + '...');
      
      // Initialize protobuf first
      await this.initProtobuf();

      const wsUrl = "wss://api.upstox.com/v2/feed/market-data-feed";
      logger.info('Connecting to market data feed:', wsUrl);

      this.marketWs = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': '*/*',
         'Api-Version': '2.0' 
        },
        followRedirects: true
      });


      this.marketWs.binaryType = 'arraybuffer';

      this.marketWs.on('open', () => {
        logger.info('Market data WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // Send subscription after connection
        setTimeout(() => {
          try {
            this.subscribe();
          } catch (error) {
            console.error('Subscription error:', error);
          }
        }, 1000);
      });

      this.marketWs.on('message', async (data) => {
        console.log("data>>>>>>>>>>>>",data)
        try {
          console.log('\n=== WebSocket Message Received ===');
          console.log('Raw data:', {
            type: typeof data,
            length: data.length,
            hex: Buffer.from(data).toString('hex')
          });

          // Try parsing as JSON first
          try {
            const message = JSON.parse(data.toString());
            console.log('Subscription response:', message);
            return;
          } catch (e) {
            // Not JSON, continue with protobuf processing
          }

          // Decode protobuf message
          const FeedResponse = this.protobufRoot.lookupType('com.upstox.marketdatafeeder.rpc.proto.FeedResponse');
          const decoded = FeedResponse.decode(new Uint8Array(data));
          const messageObj = FeedResponse.toObject(decoded, {
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
          });

          console.log('Decoded protobuf message:', JSON.stringify(messageObj, null, 2));

          if (messageObj.feeds) {
            const instrumentKey = Object.keys(messageObj.feeds)[0];
            const feed = messageObj.feeds[instrumentKey];

            console.log('Feed data:', {
              instrumentKey,
              feedType: feed.FeedUnion,
              ltpc: feed.ltpc
            });

            if (feed.FeedUnion === 'ltpc') {
              const ltpc = feed.ltpc;
              const marketData = {
                data: {
                  ltp: ltpc.ltp,
                  change: ltpc.cp ? ltpc.ltp - ltpc.cp : 0,
                  timestamp: parseInt(ltpc.ltt) || Date.now()
                }
              };

              this.lastMarketData = marketData;
              console.log('Emitting market data:', marketData);
              this.emit('marketData', marketData);
            }
          }
        } catch (error) {
          console.error('Error processing message:', {
            error: error.message,
            stack: error.stack,
            dataType: typeof data,
            dataLength: data.length,
            hexDump: Buffer.from(data).toString('hex')
          });
        }
      });

      this.marketWs.on('close', (code, reason) => {
        console.log('WebSocket Closed:', { code, reason });
        this.isConnected = false;
        this.handleReconnect();
      });

      this.marketWs.on('error', (error) => {
        console.error('WebSocket Error:', error);
        this.isConnected = false;
      });

    } catch (error) {
      console.error('Connection error:', error);
      this.handleReconnect(accessToken);
      throw error;
    }
  }

  subscribe() {
    if (!this.marketWs || this.marketWs.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const subscribeMessage = {
      guid: Date.now().toString(),
      method: 'sub',
      data: {
        mode: 'ltpc',
        instrumentKeys: ['NSE_INDEX|Nifty Bank']
      }
    };

    console.log('Sending subscription:', subscribeMessage);
    this.marketWs.send(Buffer.from(JSON.stringify(subscribeMessage)));
  }

  handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      
      console.info(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
      
      setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  async connectOrderStream(accessToken) {
    // Add update_types as query parameter
    const wsUrl = 'wss://api.upstox.com/v2/feed/portfolio-stream-feed';
    
    this.orderWs = new WebSocket(wsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Api-Version': '2.0',
       "Accept":'*/*' 
      },
      followRedirects: true
    });


    this.orderWs.on('open', () => {
      logger.info('Order WebSocket Connected');
    });

    this.orderWs.on('message', async (data) => {
        console.log("data dbfhgfhg bghfbhgbfh>>>>>>>>>>>>",data)
      try {
        const update = JSON.parse(data.toString());
        logger.info('Order update received:', update);
        
        if (update.update_type === 'order') {
          const trade = await Trade.findOne({
            where: { order_id: update.order_id }
          });

          if (trade) {
            switch (update.status) {
              case 'complete':
                await trade.update({
                  status: 'OPEN',
                  average_price: update.average_price,
                  filled_quantity: update.filled_quantity
                });
                break;
              
              case 'cancelled after market order':
              case 'rejected':
                await trade.update({
                  status: 'FAILED',
                  exit_reason: update.status_message
                });
                break;
            }

            this.emit('orderUpdate', {
              orderId: update.order_id,
              status: update.status,
              message: update.status_message,
              averagePrice: update.average_price,
              filledQuantity: update.filled_quantity
            });
          }
        }
      } catch (error) {
        logger.error('Error processing order update:', error);
      }
    });

    this.orderWs.on('error', (error) => {
      logger.error('Order WebSocket Error:', error);
    });

    this.orderWs.on('close', () => {
      logger.info('Order WebSocket Closed');
      setTimeout(() => this.connectOrderStream(accessToken), 5000);
    });
  }

  disconnect() {
    if (this.marketWs) {
      this.marketWs.close();
      this.marketWs = null;
    }
    if (this.orderWs) {
      this.orderWs.close();
      this.orderWs = null;
    }
    this.isConnected = false;
  }

  getLastMarketData() {
    return this.lastMarketData;
  }

  hexToFloat(hex) {
    // Convert hex string to buffer
    const buffer = Buffer.from(hex, 'hex');
    
    // Create DataView from buffer
    const view = new DataView(new Uint8Array(buffer).buffer);
    
    // Read as 64-bit float (double)
    return view.getFloat64(0, true); // true for little-endian
  }

  // Method to get market data socket instance
  getMarketSocket() {
    return this.marketWs;
  }

  // Method to get order stream socket instance
  getOrderSocket() {
    return this.orderWs;
  }

  // Method to check if sockets are connected
  isSocketConnected(socketType) {
    switch(socketType) {
      case 'market':
        return this.marketWs && this.marketWs.readyState === WebSocket.OPEN;
      case 'order':
        return this.orderWs && this.orderWs.readyState === WebSocket.OPEN;
      default:
        return false;
    }
  }

  // Method to get socket status
  getSocketStatus() {
    return {
      market: {
        connected: this.isSocketConnected('market'),
        readyState: this.marketWs ? this.marketWs.readyState : null
      },
      order: {
        connected: this.isSocketConnected('order'),
        readyState: this.orderWs ? this.orderWs.readyState : null
      }
    };
  }
}

// Create a singleton instance
const websocketService = new WebsocketService();
module.exports = websocketService;

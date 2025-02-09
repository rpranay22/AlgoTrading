const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const websocketService = require('./websocketService');
require('dotenv').config();

class UpstoxService {
  constructor() {
    this.apiKey = process.env.UPSTOX_API_KEY;
    this.apiSecret = process.env.UPSTOX_API_SECRET;
    this.baseUrl = 'https://api.upstox.com/v2';
    this.redirectUri = 'http://localhost:3000/api/callback';
    this.placeOrderBaseUrl='https://api-hft.upstox.com/v2'
    this.accessToken = null;
    this.init();
  }

  async init() {
    try {
      // Generate the login URL for manual authentication
      const loginUrl = this.generateLoginUrl();
      logger.info('Please authenticate using this URL:', { loginUrl });
      
      // Store the URL for later use
      this.loginUrl = loginUrl;
    } catch (error) {
      logger.error('Upstox initialization failed', { error: error.message });
    }
  }

  generateLoginUrl() {
    try {
      const params = new URLSearchParams({
        client_id: this.apiKey,
        redirect_uri: this.redirectUri,
        response_type: 'code',
        scope: 'orders holdings positions market-quote'  // Add required scopes
      });

      const loginUrl = `${this.baseUrl}/login/authorization/dialog?${params.toString()}`;
      logger.info('Generated login URL:', { url: loginUrl });
      return loginUrl;
    } catch (error) {
      logger.error('Error generating login URL:', error);
      throw error;
    }
  }

  async setAccessToken(code) {
    try {
      logger.info('Attempting to exchange code for access token');
      
      const tokenUrl = `${this.baseUrl}/login/authorization/token`;
      
      // Create form data instead of JSON
      const formData = new URLSearchParams();
      formData.append('code', code);
      formData.append('client_id', this.apiKey);
      formData.append('client_secret', this.apiSecret);
      formData.append('redirect_uri', this.redirectUri);
      formData.append('grant_type', 'authorization_code');

      const response = await axios.post(tokenUrl, formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Api-Version': '2.0'
        }
      });

      if (!response.data || !response.data.access_token) {
        throw new Error('No access token received in response');
      }

      this.accessToken = response.data.access_token;
      
      // Connect WebSocket after getting token
      await websocketService.connect(this.accessToken);
      
      logger.info('Access token set successfully');
      return this.accessToken;
    } catch (error) {
      logger.error('Error setting access token:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      throw error;
    }
  }

  async getExpiryDate(){
  console.log("expiry from ens>>>>",process.env.INSTRUMENT_KEY)
    try {
        const response = await axios.get(`${this.baseUrl}/option/contract`, {
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                Accept: "application/json",
            },
            params: { instrument_key: process.env.INSTRUMENT_KEY },
        });

        // Extract expiry dates and remove duplicates
        const expiryDates = [
            ...new Set(response.data.data.map(option => option.expiry))
        ].sort(); // Sort dates in ascending order

        console.log("Bank Nifty Expiry Dates:", expiryDates);
        return expiryDates[0];
    } catch (error) {
        console.error("Error fetching expiry dates:", error.response?.data || error.message);
        return [];
    }
  }

  async getLtp() {
    try {
      const response = await axios.get(`${this.baseUrl}/market-quote/ltp`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json',
        
        },
        params: {
          instrument_key: process.env.INSTRUMENT_KEY
        }
      });
     
      console.log("Quote data:", response.data.data[`NSE_INDEX:Nifty Bank`].last_price);
      return response.data.data[`NSE_INDEX:Nifty Bank`].last_price
    } catch (error) {
      logger.error('Error getting Banknifty price:', error);
      throw error;
    }
  }

  

  async placeOrder(orderParams) {
    console.log("orderparams>>>>",orderParams)
    try {
      logger.info('Placing order with params:', orderParams);

      const response = await axios.post(`${this.placeOrderBaseUrl}/order/place`, orderParams, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`,
          "Content-Type":'application/json'
        }
      });

      logger.info('Order placed successfully:', response.data);
      return response.data;
    } catch (error) {
      // logger.error('Error in placeOrder:', {
      //   error: error.message,
      //   response: error.response?.data,
      //   params: orderParams
      // }
      // );
      // throw error;
    }
  }

  async squareOffPosition(instrumentToken) {
    try {
      // First get position details
      const positions = await this.getPositions();
      const position = positions.find(p => p.instrument_token === instrumentToken);

      if (position) {
        const quantity = Math.abs(position.quantity);
        const type = position.quantity > 0 ? 'SELL' : 'BUY';

        // Place square off order
        await this.placeOrder(instrumentToken, quantity, type);
      }
    } catch (error) {
      logger.error('Error squaring off position:', error);
      throw error;
    }
  }

  async getPositions() {
    try {
      const response = await axios.get(`${this.baseUrl}/portfolio/short-term-positions`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Api-Version': '2.0',
          'Accept':'application/json'
        }
      });

      return response.data.data;
    } catch (error) {
      logger.error('Error getting positions:', error);
      throw error;
    }
  }

  // Helper method to monitor stop loss
  async monitorStopLoss(trade) {
    const interval = setInterval(async () => {
      try {
        const currentPrice = await this.getLTP(trade.instrumentToken);
        
        if ((trade.type === 'CALL' && currentPrice >= trade.stopLoss) ||
            (trade.type === 'PUT' && currentPrice <= trade.stopLoss)) {
          
          await this.squareOffPosition(trade.instrumentToken);
          await trade.update({ status: 'STOPPED' });
          clearInterval(interval);
          
          // If execution count is less than 2, place new trade
          if (trade.executionCount < 2) {
            const newTrade = await Trade.create({
              ...trade.toJSON(),
              executionCount: trade.executionCount + 1,
              status: 'OPEN'
            });
            this.monitorStopLoss(newTrade);
          }
        }
      } catch (error) {
        logger.error('Error monitoring stop loss:', error);
      }
    }, 1000); // Check every second
  }

 

  async getAuthCode() {
    try {
      const authUrl = `${this.baseUrl}/login/authorization/dialog?response_type=code&client_id=${this.apiKey}&redirect_uri=http://localhost:3000/api/callback`;
      
      logger.info('Authorization URL generated', { url: authUrl });
      
      throw new Error(`Please visit ${authUrl} in your browser to get the authorization code`);
    } catch (error) {
      logger.error('Error getting auth code', { error: error.message });
      throw error;
    }
  }

 

  async getInstrumentKey(strikePrice,instrument_type){
    const expiry_date=await this.getExpiryDate()
    console.log("epirt>>>>",expiry_date)
    try {
      const response = await axios.get(`${this.baseUrl}/option/contract`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          "Accept":"application/json",
          'Api-Version': '2.0'
        },
        params: {
          instrument_key:process.env.INSTRUMENT_KEY,
          expiry_date
        }
      });

      const match = response.data.data.find(item => item.strike_price == strikePrice && item.instrument_type === instrument_type);  
      console.log("inst key>>>>>>>",match)
      return match ? match.instrument_key : null;
      
    } catch (error) {
      logger.error('Error getting LTP:', error);
      throw error;
    }
        
  }

 

  async placeSingleOrder(instrument_token,quantity) {
    try {
      const orderParams = {
        "quantity": 30,
        "product": "D",
        "validity": "DAY",
        "price":0 ,
        "tag": "",
        instrument_token,
        "order_type": "MARKET",
        "transaction_type": "BUY",
        "disclosed_quantity": 30,
        "trigger_price": 199,
        "is_amo": true
      };

      return await this.placeOrder(orderParams);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new UpstoxService(); 
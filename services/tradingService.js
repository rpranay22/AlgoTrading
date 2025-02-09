const logger = require('../utils/logger');
const upstoxService = require('./upstoxService');
const Trade = require('../models/Trade');
const optionUtils = require('../utils/optionUtils');
const schedule = require('node-schedule');
const websocketService = require('./websocketService');

class TradingService {
  constructor() {
    this.settings = {
      callEntryPercent: 1.0,
      putEntryPercent: 1.0,
      callStopLossPercent: 1.3,
      putStopLossPercent: 1.3
    };
    // Schedule market open order placement
    schedule.scheduleJob('0 9 15 * * 1-5', async () => {  // 9:15 AM Mon-Fri
      try {
        await this.startTradingDay();
      } catch (error) {
        logger.error('Error in scheduled trading start:', error);
      }
    });

    // Schedule market closing square off
    schedule.scheduleJob('15 15 15 * * 1-5', async () => {  // 3:15 PM Mon-Fri
      try {
        await this.squareOffAllPositions();
      } catch (error) {
        logger.error('Error in scheduled square off:', error);
      }
    });

    // Listen for market data updates
    websocketService.on('marketData', async (data) => {
      try {
        const currentPrice = data.data.ltp;
        console.log(`Current BankNifty Price: ${currentPrice}`);
        
        // Check positions without re-emitting market data
        await this.checkPositions(currentPrice);
      } catch (error) {
        logger.error('Error processing market data:', error);
      }
    });
  }

  async startTradingDay() {
    try {
      const bankniftyPrice = await upstoxService.getLtp();
      
      // Execute CALL strategy
      await this.executeCallStrategy(bankniftyPrice);
      console.log("call executed")
      // Execute PUT strategy
      await this.executePutStrategy(bankniftyPrice);
      console.log("put executed>>>")
    } catch (error) {
      logger.error('Error in startTradingDay:', error);
      throw error;
    }
  }

  async executeCallStrategy(bankniftyPrice) {
    try {
      const entryPrice = bankniftyPrice * (1 + this.settings.callEntryPercent/100);
      const entryStrike = optionUtils.findATMStrike(entryPrice);
      const stopLoss = bankniftyPrice * (1 + this.settings.callStopLossPercent/100);
      const instrumentToken=await upstoxService.getInstrumentKey(entryStrike,"CE")
      console.log("ins token>>>>>>>>>> for calll",instrumentToken)
      upstoxService.placeSingleOrder(instrumentToken)
      
      await Trade.create({
        instrumentToken: `BANKNIFTY${entryStrike}CE`,
        type: 'CALL',
        entryPrice,
        stopLoss,
        quantity: 25,
        status: 'OPEN'
      });

      // Emit order update
      websocketService.emit('orderUpdate', {
        status: 'PLACED',
        instrumentToken: `BANKNIFTY${entryStrike}CE`,
        price: entryPrice,
        type: 'CALL'
      });
    } catch (error) {
      websocketService.emit('error', { message: error.message });
      throw error;
    }
  }

  async executePutStrategy(bankniftyPrice) {
    try {
      const entryPrice = bankniftyPrice * (1 - this.settings.putEntryPercent/100);
      const entryStrike = optionUtils.findATMStrike(entryPrice);
      const stopLoss = bankniftyPrice * (1 - this.settings.putStopLossPercent/100);
      const instrumentToken=await upstoxService.getInstrumentKey(entryStrike,"PE")
      console.log("ins token>>>>>>>>>> for puteeeee",instrumentToken)
      upstoxService.placeSingleOrder(instrumentToken)
      console.log("atm>>",entryStrike,stopLoss)
      await Trade.create({
        instrumentToken: `BANKNIFTY${entryStrike}PE`,
        type: 'PUT',
        entryPrice,
        stopLoss,
        quantity: 25,
        status: 'OPEN'
      });

      // Emit order update
      websocketService.emit('orderUpdate', {
        status: 'PLACED',
        instrumentToken: `BANKNIFTY${entryStrike}PE`,
        price: entryPrice,
        type: 'PUT'
      });
    } catch (error) {
      websocketService.emit('error', { message: error.message });
      throw error;
    }
  }

  async takePositionsInMarket(strikePrice){
    const expiryDate=await upstoxService.getExpiryDate()
    
  }

  async squareOffAllPositions() {
    try {
      const openTrades = await Trade.findAll({
        where: { status: 'OPEN' }
      });

      for (const trade of openTrades) {
        await this.squareOffPosition(trade);
      }
    } catch (error) {
      logger.error('Error in squareOffAllPositions:', error);
      throw error;
    }
  }

  async startTradingWithSettings(settings) {
    this.settings = settings;
    await this.startTradingDay();
  }

  async checkPositions(currentPrice) {
    try {
      const openTrades = await Trade.findAll({
        where: { status: 'OPEN' }
      });

      // Check stop losses
      for (const trade of openTrades) {
        if (trade.type === 'CALL' && currentPrice >= trade.stopLoss) {
          await this.squareOffPosition(trade);
        }
        if (trade.type === 'PUT' && currentPrice <= trade.stopLoss) {
          await this.squareOffPosition(trade);
        }
      }
    } catch (error) {
      logger.error('Error checking positions:', error);
    }
  }

  async squareOffPosition(trade) {
    try {
      await upstoxService.squareOffPosition(trade.instrumentToken);
      await trade.update({ status: 'SQUARED_OFF' });

      // Emit order update through websocketService
      websocketService.emit('orderUpdate', {
        status: 'SQUARED_OFF',
        instrumentToken: trade.instrumentToken,
        price: trade.stopLoss,
        type: trade.type
      });
    } catch (error) {
      logger.error('Error squaring off position:', error);
      websocketService.emit('error', { message: error.message });
      throw error;
    }
  }
}

module.exports = new TradingService(); 
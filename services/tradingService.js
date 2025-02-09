const logger = require('../utils/logger');
const upstoxService = require('./upstoxService');
const Trade = require('../models/Trade');
const optionUtils = require('../utils/optionUtils');
const schedule = require('node-schedule');
const websocketService = require('./websocketService');
const { Op } = require('sequelize');
const DailyExecutionCount = require('../models/DailyExecutionCount');

class TradingService {
  constructor() {
    this.isTrading = false;
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

    // Get socket instances
    this.marketSocket = websocketService.getMarketSocket();
    this.orderSocket = websocketService.getOrderSocket();

    // Check socket status
    const socketStatus = websocketService.getSocketStatus();
    logger.info('WebSocket Status:', socketStatus);

    // Listen for market data
    websocketService.on('marketData', async (data) => {
      if (websocketService.isSocketConnected('market')) {
        const currentPrice = data.data.ltp;
        await this.checkPositions(currentPrice);
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
      let data=""
      let stopLoss=0
      let instrumentToken=""
      let entryStrike=""
      let entryPrice=0 
       let today = new Date().toISOString().split('T')[0];
                          let [count,created]=
                            await DailyExecutionCount.findOrCreate({
                              where: { date: today, type: 'CALL' },
                              defaults: { count: 0 }
                          })
                          count=count.dataValues.count
                          if(created || count<2){
                            entryPrice = bankniftyPrice * (1 + this.settings.callEntryPercent/100);
                            entryStrike = optionUtils.findATMStrike(entryPrice);
                            stopLoss = bankniftyPrice * (1 + this.settings.callStopLossPercent/100);
                            instrumentToken=await upstoxService.getInstrumentKey(entryStrike,"CE")
                            console.log("ins token>>>>>>>>>> for calll",instrumentToken)
                            data=await upstoxService.placeSingleOrder(instrumentToken)
                            await DailyExecutionCount.update({count:count+1},{where:{date:today,type:"CALL"}})
                            await Trade.create({
                              order_id:data.data.order_id,
                              entry_strike:entryStrike,  
                               instrumentToken,
                              type: 'CALL',
                              entry_time:new Date(),
                              entryPrice:bankniftyPrice,
                              stopLoss,
                              quantity: process.env.QUANTITY,
                              status: 'OPEN'
                      
                            });
                          }
                         
     
     
    



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
      let data=""
      let stopLoss=0
      let instrumentToken=""
      let entryStrike=""
      let entryPrice=0 
      let today = new Date().toISOString().split('T')[0];
      let [count,created]=
                            await DailyExecutionCount.findOrCreate({
                              where: { date: today, type: 'PUT' },
                              defaults: { count: 0 }
                          })
                          count=count.dataValues.count
                          if(created || count<2){
                            entryPrice = bankniftyPrice * (1 + this.settings.callEntryPercent/100);
                            entryStrike = optionUtils.findATMStrike(entryPrice);
                            stopLoss = bankniftyPrice * (1 + this.settings.callStopLossPercent/100);
                            instrumentToken=await upstoxService.getInstrumentKey(entryStrike,"CE")
                            console.log("ins token>>>>>>>>>> for calll",instrumentToken)
                            data=await upstoxService.placeSingleOrder(instrumentToken)
                            await DailyExecutionCount.update({count:count+1},{where:{date:today,type:"PUT"}})
                            await Trade.create({
                              order_id:data.data.order_id,
                              entry_strike:entryStrike,   
                              instrumentToken,
                              type: 'PUT',
                              entry_time:new Date(),
                              entryPrice:bankniftyPrice,
                              stopLoss,
                              quantity: process.env.QUANTITY,
                              status: 'OPEN'
                      
                            });
                      
                          }

   
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

      if (openTrades.length === 0) {
        throw new Error('No open positions to stop');
      }

      await upstoxService.cancelAllOrders();
      
      for (const trade of openTrades) {
        await this.squareOffPosition(trade, 'MANUAL_STOP');
      }
      
      this.isTrading = false;
      
      return {
        success: true,
        message: 'All positions squared off'
      };
    } catch (error) {
      this.isTrading = false;
      logger.error('Error in squareOffAllPositions:', error);
      throw error;
    }
  }

  async startTradingWithSettings(settings) {
    try {
      // Check if already trading
      const openTrades = await Trade.count({ where: { status: 'OPEN' } });
      if (openTrades > 0 || this.isTrading) {
        this.isTrading = false;
        throw new Error('Trading is already in progress');
      }

      this.isTrading = true;
      this.settings = settings;
      await this.startTradingDay();
    } catch (error) {
      this.isTrading = false;
      logger.error('Error starting trading:', error);
      throw error;
    }
  }

  async checkPositions(currentPrice) {
    try {
      const openTrades = await Trade.findAll({
        where: { status: 'OPEN' }
      });

      logger.info(`Checking ${openTrades.length} open positions against price: ${currentPrice}`);

      for (const trade of openTrades) {
        logger.info(`Checking trade: ${trade.type}, Strike: ${trade.entry_strike}, SL: ${trade.stopLoss}`);

        // For CALL options
        if (trade.type === 'CALL') {
          logger.info(`CALL Position - Current: ${currentPrice}, StopLoss: ${trade.stopLoss}`);
          if (currentPrice >= trade.stopLoss) {
            logger.warn(`CALL StopLoss Hit - Price: ${currentPrice}, StopLoss: ${trade.stopLoss}`);
            await this.squareOffPosition(trade, 'SL_HIT');
            
            const executionCount = await this.getExecutionCount(trade.type);
            logger.info(`CALL Execution Count: ${executionCount}`);
            if (executionCount < 2) {
              await this.reEnterPosition(trade, currentPrice);
            }
          }
        }
        
        // For PUT options
        if (trade.type === 'PUT') {
          logger.info(`PUT Position - Current: ${currentPrice}, StopLoss: ${trade.stopLoss}`);
          if (currentPrice <= trade.stopLoss) {
            logger.warn(`PUT StopLoss Hit - Price: ${currentPrice}, StopLoss: ${trade.stopLoss}`);
            await this.squareOffPosition(trade, 'SL_HIT');
            
            const executionCount = await this.getExecutionCount(trade.type);
            logger.info(`PUT Execution Count: ${executionCount}`);
            if (executionCount < 2) {
              await this.reEnterPosition(trade, currentPrice);
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error checking positions:', error);
    }
  }

  async getExecutionCount(type) {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const record = await DailyExecutionCount.findOne({
        where: {
          date: today,
          type: type
        }
      });
      
      return record ? record.count : 0;
    } catch (error) {
      logger.error('Error getting execution count:', error);
      throw error;
    }
  }

  async incrementExecutionCount(type) {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // First try to find existing record
      let record = await DailyExecutionCount.findOne({
        where: {
          date: today,
          type: type
        }
      });

      if (!record) {
        // If no record exists, create one
        record = await DailyExecutionCount.create({
          date: today,
          type: type,
          count: 1
        });
        logger.info(`Created new execution count for ${type} on ${today}`);
      } else {
        // If record exists, increment it
        record.count += 1;
        await record.save();
        logger.info(`Updated execution count for ${type} on ${today} to ${record.count}`);
      }

      return record.count;
    } catch (error) {
      logger.error('Error incrementing execution count:', error, {
        type,
        date: new Date().toISOString().split('T')[0]
      });
      throw error;
    }
  }

  async reEnterPosition(oldTrade, currentPrice) {
    try {
      // Get current count before increment
      const beforeCount = await this.getExecutionCount(oldTrade.type);
      logger.info(`Current execution count before re-entry: ${beforeCount} for ${oldTrade.type}`);

      if (beforeCount >= 2) {
        logger.info(`Maximum executions (${beforeCount}) reached for ${oldTrade.type} today`);
        return;
      }

      // Calculate new strikes based on current price
      const newStrike = this.calculateNewStrike(currentPrice, oldTrade.type);
      const newStopLoss = this.calculateNewStopLoss(currentPrice, oldTrade.type);

      // Get instrument token for new strike
      const instrumentToken = await upstoxService.getInstrumentKey(
        newStrike,
        oldTrade.type === 'CALL' ? 'CE' : 'PE'
      );

      // Place new order
      const orderData = await upstoxService.placeSingleOrder(instrumentToken);

      // Increment execution count
      const newCount = await this.incrementExecutionCount(oldTrade.type);
      logger.info(`New execution count after re-entry: ${newCount} for ${oldTrade.type}`);

      // Create new trade record with the updated count
      await Trade.create({
        instrumentToken,
        order_id: orderData.data.order_id,
        entry_strike: newStrike,
        type: oldTrade.type,
        entry_time: new Date(),
        entryPrice: currentPrice,
        stopLoss: newStopLoss,
        quantity: process.env.QUANTITY,
        status: 'OPEN',
        execution_count: newCount,
        parent_trade_id: oldTrade.id
      });

      logger.info(`Successfully re-entered position with execution count ${newCount}`);

    } catch (error) {
      logger.error('Error re-entering position:', error);
      throw error;
    }
  }

  calculateNewStrike(currentPrice, type) {
    if (type === 'CALL') {
      // For CALL: Calculate strike 1% above current price
      const strikePrice = currentPrice * 1.01;  // Add 1%
      return Math.ceil(strikePrice / 100) * 100;  // Round up to nearest 100
    } else {
      // For PUT: Calculate strike 1% below current price
      const strikePrice = currentPrice * 0.99;  // Subtract 1%
      return Math.floor(strikePrice / 100) * 100;  // Round down to nearest 100
    }
  }

  calculateNewStopLoss(currentPrice, type) {
    if (type === 'CALL') {
      // For CALL: Stop loss 1.3% above current price
      return Math.ceil(currentPrice * 1.013);  // Add 1.3%
    } else {
      // For PUT: Stop loss 1.3% below current price
      return Math.floor(currentPrice * 0.987);  // Subtract 1.3%
    }
  }

  async squareOffPosition(trade, exitReason = 'SL_HIT') {
    try {
      await upstoxService.squareOffPosition(trade.instrumentToken);
      
      await trade.update({ 
        status: 'CLOSED',
        exit_time: new Date(),
        exit_reason: exitReason
      });

      // After closing a position, check if there are any remaining open trades
      const openTrades = await Trade.count({ where: { status: 'OPEN' } });
      if (openTrades === 0) {
        this.isTrading = false; // Set trading to false only if no open trades
      }

      websocketService.emit('orderUpdate', {
        status: 'SQUARED_OFF',
        instrumentToken: trade.instrumentToken,
        type: trade.type,
        reason: exitReason
      });
    } catch (error) {
      logger.error('Error squaring off position:', error);
      throw error;
    }
  }

  async getTradingStatus() {
    try {
      const openTrades = await Trade.findAll({
        where: { status: 'OPEN' }
      });
      
      return {
        isTrading: openTrades.length > 0,
        openTradesCount: openTrades.length
      };
    } catch (error) {
      logger.error('Error getting trading status:', error);
      throw error;
    }
  }
}

module.exports = new TradingService(); 
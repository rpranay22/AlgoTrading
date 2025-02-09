const Trade = require('../models/Trade');
const { Op, literal } = require('sequelize');

class TradeService {
  async createTrade(tradeData) {
    return await Trade.create({
      order_id: tradeData.orderId,
      instrument: tradeData.instrument,
      trade_type: tradeData.tradeType,
      entry_price: tradeData.entryPrice,
      quantity: tradeData.quantity,
      entry_time: new Date(),
      status: 'OPEN'
    });
  }

  async closeTrade(orderId, exitData) {
    const trade = await Trade.findOne({
      where: { order_id: orderId }
    });

    if (!trade) throw new Error('Trade not found');

    const profitLoss = (exitData.exitPrice - trade.entry_price) * 
      (trade.trade_type === 'CALL' ? 1 : -1) * trade.quantity;

    return await trade.update({
      exit_price: exitData.exitPrice,
      exit_time: new Date(),
      profit_loss: profitLoss,
      status: 'CLOSED',
      exit_reason: exitData.reason
    });
  }

  async getDailyPnL() {
    const result = await Trade.sum('profit_loss', {
      where: {
        status: 'CLOSED',
        exit_time: {
          [Op.gte]: new Date().setHours(0, 0, 0, 0)
        }
      }
    });
    
    return result || 0;
  }

  async getTotalPnL() {
    const results = await Trade.findAll({
      where: {
        status: 'CLOSED'
      },
      attributes: [
        [literal('SUM(CASE WHEN profit_loss > 0 THEN profit_loss ELSE 0 END)'), 'total_profit'],
        [literal('SUM(CASE WHEN profit_loss < 0 THEN profit_loss ELSE 0 END)'), 'total_loss'],
        [literal('SUM(profit_loss)'), 'net_pnl']
      ],
      raw: true
    });

    const result = results[0] || { total_profit: 0, total_loss: 0, net_pnl: 0 };
    
    return {
      totalProfit: Number(result.total_profit) || 0,
      totalLoss: Number(result.total_loss) || 0,
      netPnL: Number(result.net_pnl) || 0
    };
  }

  async getTradeHistory(limit = 100) {
    return await Trade.findAll({
      order: [['createdAt', 'DESC']],
      limit
    });
  }
}

module.exports = new TradeService(); 
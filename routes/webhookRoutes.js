const express = require('express');
const router = express.Router();
const Trade = require('../models/Trade');
const logger = require('../utils/logger');
const websocketService = require('../services/websocketService');

router.post('/order-update', async (req, res) => {
  try {
    const update = req.body;
    console.log("update>>>>>>>>>>>>",update)
    logger.info('Webhook order update received:', update.order_id);


    // Find the trade by order_id
    const trade = await Trade.findOne({
      where: { order_id: update.order_id }
    });
    logger.info("trade>>>>>>>>>>>>",trade)
    if (trade) {
      switch (update.status.toLowerCase()) {
        case 'complete':
          await trade.update({
            status: 'OPEN',
            average_price: update.average_price || trade.entryPrice,
            filled_quantity: update.filled_quantity || trade.quantity
          });
          break;

        case 'cancelled':
        case 'rejected':
        case 'cancelled after market order':
          await trade.update({
            status: 'FAILED',
            exit_reason: update.status_message || update.status
          });
          break;

        case 'open':
          await trade.update({
            status: 'PENDING'
          });
          break;
      }

      // Emit update through websocket
      websocketService.emit('orderUpdate', {
        orderId: update.order_id,
        status: update.status,
        message: update.status_message,
        averagePrice: update.average_price,
        filledQuantity: update.filled_quantity,
        instrument: update.trading_symbol,
        orderType: update.order_type,
        transactionType: update.transaction_type
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 
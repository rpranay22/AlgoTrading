const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Trade = sequelize.define('Trade', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  instrumentToken: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'instrument_token'
  },
  order_id: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'order_id'
  },

  type: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'trade_type'
  },
  entry_strike: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'entry_strike'
  },
  entryPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'entry_price'
  },
  stopLoss: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'stop_loss'
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false
  },
  
  profit_loss: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  entry_time: {
    type: DataTypes.DATE,
    allowNull: false
  },
  exit_time: {
    type: DataTypes.DATE,
    allowNull: true
  },
  exit_reason: {
    type: DataTypes.STRING,  // 'SL_HIT', 'TARGET_HIT', 'MANUAL'
    allowNull: true
  },
  execution_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'execution_count'
  },
  parent_trade_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'parent_trade_id'
  }
}, {
  tableName: 'trades',
  underscored: true,
  timestamps: true
});

module.exports = Trade; 
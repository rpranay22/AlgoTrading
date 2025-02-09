const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Trade = sequelize.define('Trade', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  order_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  instrument: {
    type: DataTypes.STRING,
    allowNull: false
  },
  trade_type: {
    type: DataTypes.STRING,  // 'CALL' or 'PUT'
    allowNull: false
  },
  entry_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  exit_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  quantity: {
    type: DataTypes.DECIMAL(10, 2),
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
  status: {
    type: DataTypes.STRING,  // 'OPEN', 'CLOSED'
    allowNull: false
  },
  exit_reason: {
    type: DataTypes.STRING,  // 'SL_HIT', 'TARGET_HIT', 'MANUAL'
    allowNull: true
  }
}, {
  timestamps: true,
  tableName: 'trades'
});

module.exports = Trade; 
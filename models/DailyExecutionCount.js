const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DailyExecutionCount = sequelize.define('daily_execution_counts', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  type: {
    type: DataTypes.STRING,  // 'CALL' or 'PUT'
    allowNull: false
  },
  count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  timestamps: true,
  underscored: true,
  tableName: 'daily_execution_counts',
  indexes: [
    {
      unique: true,
      fields: ['date', 'type']
    }
  ]
});

module.exports = DailyExecutionCount; 
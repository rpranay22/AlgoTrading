'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up({ context: queryInterface }) {
    await queryInterface.createTable('trades', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      instrument_token: {
        type: DataTypes.STRING,
        allowNull: false
      },
      order_id: {
        type: DataTypes.STRING,
        allowNull: false
      },
      trade_type: {
        type: DataTypes.STRING,
        allowNull: false
      },
      entry_strike: {
        type: DataTypes.STRING,
        allowNull: false
      },
      entry_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      stop_loss: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
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
        type: DataTypes.STRING,
        allowNull: true
      },
      execution_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      parent_trade_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'trades',
          key: 'id'
        }
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });
  },

  async down({ context: queryInterface }) {
    await queryInterface.dropTable('trades');
  }
}; 
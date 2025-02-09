'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up({ context: queryInterface }) {
    await queryInterface.createTable('daily_execution_counts', {
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
        type: DataTypes.STRING,
        allowNull: false
      },
      count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false
      }
    }, {
      indexes: [
        {
          unique: true,
          fields: ['date', 'type'],
          name: 'daily_execution_counts_date_type'
        }
      ]
    });
  },

  async down({ context: queryInterface }) {
    await queryInterface.dropTable('daily_execution_counts');
  }
}; 
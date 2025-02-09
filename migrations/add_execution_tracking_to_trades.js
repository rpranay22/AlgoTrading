const { DataTypes } = require('sequelize');

module.exports = {
  name: 'add_execution_tracking_to_trades',
  
  async up({ context: queryInterface }) {
    await queryInterface.addColumn('trades', 'execution_count', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    });

    await queryInterface.addColumn('trades', 'parent_trade_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'trades',
        key: 'id'
      }
    });
  },

  async down({ context: queryInterface }) {
    await queryInterface.removeColumn('trades', 'execution_count');
    await queryInterface.removeColumn('trades', 'parent_trade_id');
  }
}; 
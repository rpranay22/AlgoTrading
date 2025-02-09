exports.up = function(knex) {
  return knex.schema.createTable('trades', table => {
    table.increments('id').primary();
    table.string('order_id').notNullable();
    table.string('instrument').notNullable();
    table.string('trade_type').notNullable(); // 'CALL' or 'PUT'
    table.decimal('entry_price', 10, 2).notNullable();
    table.decimal('exit_price', 10, 2);
    table.decimal('quantity', 10, 2).notNullable();
    table.decimal('profit_loss', 10, 2);
    table.timestamp('entry_time').notNullable();
    table.timestamp('exit_time');
    table.string('status').notNullable(); // 'OPEN', 'CLOSED'
    table.string('exit_reason'); // 'SL_HIT', 'TARGET_HIT', 'MANUAL'
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('trades');
}; 
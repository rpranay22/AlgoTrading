const { Sequelize } = require('sequelize');
require('dotenv').config();
const path = require('path');
const { Umzug, SequelizeStorage } = require('umzug');

// Create Sequelize instance
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    logging: false,
    define: {
      timestamps: true,
      underscored: true
    }
  }
);

// Run migrations
const runMigrations = async () => {
  try {
    const umzug = new Umzug({
      migrations: { 
        glob: 'migrations/*.js',
        resolve: ({ name, path, context }) => {
          const migration = require(path);
          return {
            name,
            up: async () => migration.up({ context }),
            down: async () => migration.down({ context }),
          };
        },
      },
      context: sequelize.getQueryInterface(),
      storage: new SequelizeStorage({ sequelize }),
      logger: console,
    });

    const pending = await umzug.pending();
    if (pending.length > 0) {
      console.log('Pending migrations:', pending.map(m => m.name));
      await umzug.up();
      console.log('Migrations completed successfully');
    } else {
      console.log('No pending migrations');
    }
  } catch (error) {
    console.error('Error running migrations:', error);
    if (error.code === 'MODULE_NOT_FOUND') {
      console.warn('Migration module not found. Skipping migrations.');
    }
  }
};

// Initialize database connection
const initDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');
    await runMigrations();
  } catch (err) {
    console.error('Unable to connect to database:', err);
    throw err;
  }
};

// Run initialization
initDatabase();

// Export only the sequelize instance
module.exports = sequelize; 
const sql = require('mssql');
const secretsManager = require('aws-sdk/clients/secretsmanager');
const env = require('./env');
const env_messages = require('./env_messages');

/**
 * Establishes a connection to the specified database using the provided credentials.
 * @param {object} databaseInfo - Information about the database connection.
 * @returns {Promise<sql.ConnectionPool>} A Promise that resolves to the connected database pool.
 */
async function connectToDatabase(databaseInfo) {
    try {
        const secretsManagerClient = new secretsManager({region: env.REGION});

        const secretResponse = await secretsManagerClient.getSecretValue({
            SecretId: databaseInfo.secretName
        }).promise();

        const credentials = JSON.parse(secretResponse.SecretString);

        const commonConfig = {
            options: {
                encrypt: false,
                max: 3
            },
            dialectOptions: {
                instanceName: 'SQLEXPRESS'
            }
        };

        const config = {
            ...commonConfig,
            user: credentials.user || credentials.username,
            password: credentials.password,
            server: credentials.server || credentials.url,
            database: credentials.name_database || credentials.database,
            dialect: 'mssql'
        };

        const pool = new sql.ConnectionPool(config);
        await pool.connect();

        return pool;
    } catch (error) {
        console.error(env_messages.ERROR.ERROR_CONNECTING_TO_THE_DATABASE, error.message);
        throw error;
    }
}

/**
 * Database connection information for different databases.
 */
const databases = {
    db_Fk: {
        secretName: env.SECRET_MANAGER.CONNECTION_DB_FK,
    },
    db_Aws: {
        secretName: env.SECRET_MANAGER.CONNECTION_DB_AWS,
    }
};

module.exports = {
    connectToDatabase,
    databases
};
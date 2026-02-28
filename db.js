const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host:     process.env.MYSQLHOST,
    port:     process.env.MYSQLPORT || 3306,
    user:     process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    ssl: { rejectUnauthorized: false }
});

module.exports = pool;

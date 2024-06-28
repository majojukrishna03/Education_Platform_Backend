const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'education_platform',
  password: 'Murali@123',
  port: 5010,
});

// Test PostgreSQL connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to PostgreSQL:', err);
  } else {
    console.log('Connected to PostgreSQL on', pool.options.host);
  }
});

// Create table if not exists
const createTableQuery = `
  CREATE TABLE IF NOT EXISTS registrations (
    email VARCHAR(255) PRIMARY KEY,
    fullName VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL
  )
`;

pool.query(createTableQuery, (err, res) => {
  if (err) {
    console.error('Error creating table:', err);
  } else {
    console.log('Table "registrations" is ready');
  }
});

// Example route to handle registration
app.post('/api/register', async (req, res) => {
  const { fullName, email, password } = req.body;

  try {
    const insertQuery = 'INSERT INTO registrations (email, fullName, password) VALUES ($1, $2, $3) RETURNING *';
    const values = [email, fullName, password];
    const result = await pool.query(insertQuery, values);
    
    res.status(201).json({ message: 'Registration successful!', registration: result.rows[0] });
  } catch (error) {
    console.error('Error saving registration:', error);
    res.status(500).json({ message: 'Registration failed.' });
  }
});

// Route to handle login and issue JWT token
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Query the database to find user with matching email and password
    const query = 'SELECT * FROM registrations WHERE email = $1 AND password = $2';
    const values = [email, password];
    const result = await pool.query(query, values);

    if (result.rows.length > 0) {
      // User found, generate JWT token
      const userData = {
        email: result.rows[0].email,
        fullName: result.rows[0].fullName,
      };

      // Sign JWT token with a secret key
      const token = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '1h' });

      // Return token and user data
      res.status(200).json({ token, userData });
    } else {
      // User not found or credentials don't match
      res.status(401).json({ message: 'Login failed. Please check your credentials.' });
    }
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ message: 'Login failed. Please try again later.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

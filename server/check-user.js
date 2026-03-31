require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOne({ username: 'Abhinav' });
  console.log('User Abhinav:', JSON.stringify(user, null, 2));
  process.exit(0);
}

check();

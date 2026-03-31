require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOne({ username: 'Abhinav' });
  console.log('PublicKey exists?', !!user.publicKey);
  console.log('PublicKey keys:', Object.keys(user.publicKey || {}));
  process.exit(0);
}

check();

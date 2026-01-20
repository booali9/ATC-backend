// utils/multerCloudinary.js
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary'); // your cloudinary config

// Configure Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'messages', // folder in Cloudinary
    allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'mp3', 'wav', 'ogg'],
  },
});  

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

module.exports = upload;

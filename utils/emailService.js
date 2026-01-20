const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS, // Use App Password for Gmail
  },
});

// Verify transporter configuration
transporter.verify(function (error, success) {
  if (error) {
    console.log('❌ SMTP configuration error:', error);
  } else {
    console.log('✅ SMTP server is ready to take our messages');
  }
});

// Send OTP Email for Registration
const sendRegistrationOTP = async (email, name, otp) => {
  try {
    const mailOptions = {
      from: `"Your App Name" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Verify Your Account - OTP Code',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .header { text-align: center; color: #333; }
                .otp-code { font-size: 32px; font-weight: bold; color: #2563eb; text-align: center; margin: 20px 0; padding: 15px; background: #f8fafc; border-radius: 5px; letter-spacing: 5px; }
                .footer { margin-top: 30px; text-align: center; color: #666; font-size: 14px; }
                .warning { background: #fff3cd; color: #856404; padding: 10px; border-radius: 5px; margin: 15px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Verify Your Account</h1>
                </div>
                <p>Hello <strong>${name}</strong>,</p>
                <p>Thank you for registering with us! Use the OTP code below to verify your account:</p>
                
                <div class="otp-code">${otp}</div>
                
                <div class="warning">
                    <strong>Note:</strong> This OTP will expire in 10 minutes. Do not share this code with anyone.
                </div>
                
                <p>If you didn't request this verification, please ignore this email.</p>
                
                <div class="footer">
                    <p>Best regards,<br>Your App Team</p>
                </div>
            </div>
        </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Registration OTP email sent to ${email}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending registration OTP email:', error);
    return false;
  }
};

// Send OTP Email for Password Reset
const sendResetPasswordOTP = async (email, name, otp) => {
  try {
    const mailOptions = {
      from: `"Your App Name" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Reset Your Password - OTP Code',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .header { text-align: center; color: #333; }
                .otp-code { font-size: 32px; font-weight: bold; color: #dc2626; text-align: center; margin: 20px 0; padding: 15px; background: #fef2f2; border-radius: 5px; letter-spacing: 5px; }
                .footer { margin-top: 30px; text-align: center; color: #666; font-size: 14px; }
                .warning { background: #fff3cd; color: #856404; padding: 10px; border-radius: 5px; margin: 15px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Reset Your Password</h1>
                </div>
                <p>Hello <strong>${name}</strong>,</p>
                <p>We received a request to reset your password. Use the OTP code below to proceed:</p>
                
                <div class="otp-code">${otp}</div>
                
                <div class="warning">
                    <strong>Note:</strong> This OTP will expire in 10 minutes. If you didn't request a password reset, please ignore this email.
                </div>
                
                <p>For security reasons, this OTP is valid for a single use only.</p>
                
                <div class="footer">
                    <p>Best regards,<br>Your App Team</p>
                </div>
            </div>
        </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Reset password OTP email sent to ${email}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending reset password OTP email:', error);
    return false;
  }
};

module.exports = {
  sendRegistrationOTP,
  sendResetPasswordOTP,
  transporter
};
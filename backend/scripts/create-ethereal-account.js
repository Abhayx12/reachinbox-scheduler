// Run with: node scripts/create-ethereal-account.js
// Prints a fresh Ethereal Email test SMTP account you can paste into .env
const nodemailer = require("nodemailer");

nodemailer.createTestAccount((err, account) => {
  if (err) {
    console.error("Failed to create Ethereal account:", err);
    process.exit(1);
  }
  console.log("Add these to your backend/.env:\n");
  console.log(`ETHEREAL_SMTP_HOST=${account.smtp.host}`);
  console.log(`ETHEREAL_SMTP_PORT=${account.smtp.port}`);
  console.log(`ETHEREAL_SMTP_USER=${account.user}`);
  console.log(`ETHEREAL_SMTP_PASS=${account.pass}`);
  console.log(`\nView sent mail at: https://ethereal.email/login (use the same user/pass)`);
});

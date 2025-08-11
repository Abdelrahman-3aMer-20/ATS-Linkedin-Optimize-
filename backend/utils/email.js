const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com', // لو هتستخدم Brevo
  port: 587,
  auth: {
    user: process.env.SMTP_USER, // حطه في .env
    pass: process.env.SMTP_PASS,
  },
});

async function sendUpsellEmail(to, name, score, analysisId) {
  const message = `
    <h2>نتيجتك في الفحص: ${score}%</h2>
    <p>فيه ملاحظات كتير ممكن تحسن فرصك في الوظايف 🔥</p>
    <p>افتح التقرير كامل (بـ 5$ بس) عشان تعرف كل التفاصيل + النسخة المحسنة CV أو LinkedIn</p>
    <a href="${process.env.FRONTEND_URL}/checkout?analysis=${analysisId}" style="background:#007bff;color:#fff;padding:10px 15px;text-decoration:none;">افتح التقرير كامل</a>
  `;

  await transporter.sendMail({
    from: `"ATS Optimizer" <${process.env.SMTP_USER}>`,
    to,
    subject: `تحسين فرصك في الوظائف يبدأ هنا 🚀`,
    html: message,
  });
}

module.exports = { sendUpsellEmail };

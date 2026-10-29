const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const { sendError } = require("../utils/errors");

const router = express.Router();

function isMockMode() {
  const mode = String(process.env.OTP_MODE || "").toLowerCase().trim();
  return mode === "mock" || mode === "development" || mode === "dev";
}

router.post("/send-otp", async (req, res) => {
  try {
    const mobile = String(req.body.mobile || "").trim();

    if (!mobile) {
      return res.status(400).json({ message: "Mobile number is required" });
    }

    const [users] = await pool.query(
      `SELECT u.id, u.name, u.mobile, u.status, ur.role
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.mobile = ? OR RIGHT(u.mobile, 10) = RIGHT(?, 10)`,
      [mobile, mobile]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: "Mobile number not registered" });
    }

    const activeUser = users.find((u) => u.status === "ACTIVE");

    if (!activeUser) {
      return res.status(403).json({ message: "User is not active" });
    }

    const mockOtp = process.env.MOCK_OTP || "123456";

    if (isMockMode()) {
      return res.json({ message: "OTP sent successfully", devOtp: mockOtp });
    }

    await pool.query(
      `INSERT INTO otp_requests
       (mobile, otp_hash, purpose, expires_at, status)
       VALUES (?, ?, 'LOGIN', DATE_ADD(NOW(), INTERVAL 5 MINUTE), 'PENDING')`,
      [mobile, mockOtp]
    );

    return res.json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error("send-otp error", error);
    return sendError(res, error);
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const mobile = String(req.body.mobile || "").trim();
    const otp = String(req.body.otp || "").trim();

    if (!mobile || !otp) {
      return res.status(400).json({ message: "Mobile and OTP are required" });
    }

    const mockOtp = String(process.env.MOCK_OTP || "123456").trim();

    // In mock/development mode OR if the OTP matches MOCK_OTP, bypass DB OTP check
    if (isMockMode() || (process.env.MOCK_OTP && otp === mockOtp)) {
      if (otp !== mockOtp) {
        return res.status(400).json({ message: "Invalid OTP" });
      }
    } else {
      const [otpRows] = await pool.query(
        `SELECT * FROM otp_requests
         WHERE (mobile = ? OR RIGHT(mobile, 10) = RIGHT(?, 10))
           AND purpose = 'LOGIN'
           AND status = 'PENDING'
           AND is_used = FALSE
         ORDER BY id DESC
         LIMIT 1`,
        [mobile, mobile]
      );

      if (otpRows.length === 0) {
        return res.status(400).json({ message: "OTP not found or already used" });
      }

      const otpRow = otpRows[0];
      const [expiredCheck] = await pool.query(`SELECT NOW() > ? AS is_expired`, [otpRow.expires_at]);

      if (expiredCheck[0].is_expired) {
        await pool.query(`UPDATE otp_requests SET status = 'EXPIRED' WHERE id = ?`, [otpRow.id]);
        return res.status(400).json({ message: "OTP expired" });
      }

      if (otpRow.otp_hash !== otp) {
        await pool.query(`UPDATE otp_requests SET attempt_count = attempt_count + 1 WHERE id = ?`, [otpRow.id]);
        return res.status(400).json({ message: "Invalid OTP" });
      }

      await pool.query(
        `UPDATE otp_requests SET status = 'VERIFIED', is_used = TRUE, verified_at = NOW() WHERE id = ?`,
        [otpRow.id]
      );
    }

    const [users] = await pool.query(
      `SELECT u.id, u.name, u.mobile, u.email, ur.role
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       WHERE (u.mobile = ? OR RIGHT(u.mobile, 10) = RIGHT(?, 10))
         AND u.status = 'ACTIVE'
       LIMIT 1`,
      [mobile, mobile]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: "Active user not found" });
    }

    const user = users[0];

    await pool.query(
      `UPDATE users SET last_login_at = NOW(), is_mobile_verified = TRUE WHERE id = ?`,
      [user.id]
    );

    const token = jwt.sign(
      { userId: user.id, mobile: user.mobile, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    return res.json({ message: "Login successful", token, user });
  } catch (error) {
    console.error("verify-otp error", error);
    return sendError(res, error);
  }
});

module.exports = router;

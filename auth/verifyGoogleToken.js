const { auth, db } = require("../../firebaseConfig");

module.exports = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ success: false, message: "Missing ID token" });

    const decodedToken = await auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, message: "User not found in Firestore" });
    }

    const user = userDoc.data();
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: "Account deactivated" });
    }

    const customToken = await auth.createCustomToken(uid);

    return res.status(200).json({
      success: true,
      token: customToken,
      user
    });

  } catch (error) {
    console.error("Google Sign-In error:", error);
    return res.status(401).json({ success: false, message: "Invalid token", error: error.message });
  }
};
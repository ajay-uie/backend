const { auth, db } = require('./firebaseConfig')

module.exports = async (idToken) => {
  try {
    const decoded = await auth.verifyIdToken(idToken)
    const uid = decoded.uid
    const userDoc = await db.collection('users').doc(uid).get()

    if (!userDoc.exists) {
      return { success: false, message: "User profile not found", statusCode: 404 }
    }

    const user = userDoc.data()

    if (!user.isActive) {
      return { success: false, message: "Account deactivated", statusCode: 403 }
    }

    await db.collection('users').doc(uid).update({
      lastLoginAt: db.FieldValue.serverTimestamp(),
      updatedAt: db.FieldValue.serverTimestamp()
    })

    return {
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      },
      message: 'Login successful',
      statusCode: 200
    }
  } catch (err) {
    console.error("Token verification failed:", err)
    return { success: false, message: "Invalid ID token", error: err.message, statusCode: 401 }
  }
}
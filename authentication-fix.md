# Authentication Fix for FikaConnect

## Problem Analysis

After examining the code in `driver-dashboard.html`, `sender-active-deliveries.html`, and `admin-dashboard.html`, I've identified the authentication issues that are causing problems for driver and sender users while working correctly for admin users.

## Current Issues

1. **Inconsistent Role Verification**: The driver and sender dashboards are not properly verifying user roles before attempting to access data.

2. **Missing User Role Data**: The user documents in Firestore may not have the correct role flags (`isDriver` for drivers).

3. **Security Rules Conflicts**: The Firebase security rules may be too restrictive or not properly configured for different user roles.

## Solution: Authentication and Role Verification Fix

### 1. Fix Driver Authentication in `driver-dashboard.html`

The issue in the driver dashboard is in the authentication check around line 393:

```javascript
if (userDocSnap.exists() && userDocSnap.data().isDriver) {
    userNameDisplay.textContent = userDocSnap.data().name || "Driver";
    // Now call fetchAndDisplayBookings with real-time listeners
    setupRealtimeBookingsListeners();
} else {
    alert("Access Denied: You are not authorized to view this page.");
    await signOut(auth);
    window.location.href = 'login.html';
}
```

The problem is that the `isDriver` flag might not be set correctly in the user document, or it might be using a different property name.

### 2. Fix Sender Authentication in `sender-active-deliveries.html`

The sender dashboard needs a similar role verification check:

```javascript
// Add this code to the onAuthStateChanged function in sender-active-deliveries.html
if (user) {
    CURRENT_USER_ID = user.uid;
    console.log("Firebase: User is logged in, UID:", user.uid);
    
    // Add this role verification
    const userDocRef = doc(db, "users", user.uid);
    try {
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
            // Check if user is NOT a driver (meaning they're a sender)
            if (!userDocSnap.data().isDriver) {
                // User is a sender, proceed with fetching deliveries
                fetchAndDisplayDeliveries(CURRENT_USER_ID);
            } else {
                // User is a driver, redirect to driver dashboard
                alert("You are logged in as a driver. Redirecting to driver dashboard.");
                window.location.href = 'driver-dashboard.html';
            }
        } else {
            // User document doesn't exist, create a basic one
            await setDoc(doc(db, "users", user.uid), {
                email: user.email,
                isDriver: false, // Default to sender
                createdAt: serverTimestamp()
            });
            fetchAndDisplayDeliveries(CURRENT_USER_ID);
        }
    } catch (error) {
        console.error("Error checking user role:", error);
        // Still allow access to avoid locking users out completely
        fetchAndDisplayDeliveries(CURRENT_USER_ID);
    }
} else {
    console.log("Firebase: User not logged in, redirecting to login.html");
    window.location.href = 'login.html';
}
```

### 3. Ensure User Role Data is Properly Set During Registration

Make sure that when users register, they are assigned the correct role flags in their user documents:

```javascript
// Add this to your signup.html or registration process
// When creating a new user document:

await setDoc(doc(db, "users", user.uid), {
    name: nameInput.value,
    email: emailInput.value,
    contact: phoneInput.value,
    isDriver: isDriverCheckbox.checked, // Use a checkbox to let users select if they're a driver
    createdAt: serverTimestamp()
});
```

### 4. Update Login Logic to Redirect Based on Role

Modify the login.js file to redirect users to the appropriate dashboard based on their role:

```javascript
// In the handleUserRoleAndRedirect function in login.html
async function handleUserRoleAndRedirect(user) {
    if (!user) {
        return;
    }

    const adminDocRef = doc(db, "admins", user.uid);
    const adminDocSnap = await getDoc(adminDocRef);

    if (adminDocSnap.exists() && adminDocSnap.data().isAdmin === true) {
        console.log("Admin user logged in. Redirecting to admin dashboard.");
        window.location.href = 'admin-dashboard.html';
        return;
    }

    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        if (userData.isDriver) {
            console.log("Driver user logged in. Redirecting to driver dashboard.");
            localStorage.setItem('currentDriverId', user.uid);
            window.location.href = 'driver-dashboard.html';
            return;
        } else {
            console.log("Sender/Customer logged in. Redirecting to sender dashboard.");
            window.location.href = 'sender-dashboard.html';
            return;
        }
    } else {
        console.warn("User profile incomplete or not found in 'users' collection for UID:", user.uid);
        // Create a basic user profile with default sender role
        try {
            await setDoc(doc(db, "users", user.uid), {
                email: user.email,
                isDriver: false, // Default to sender
                createdAt: serverTimestamp()
            });
            window.location.href = 'sender-dashboard.html';
        } catch (error) {
            console.error("Error creating user profile:", error);
            loginMessage.textContent = 'Error creating user profile. Please try again or contact support.';
            loginMessage.className = 'auth-message error-message';
            await auth.signOut();
        }
    }
}
```

### 5. Fix for Firestore Security Rules

The security rules should be updated to properly handle different user roles. This is covered in detail in the `firebase-security-rules-fix.md` file, but here's a summary of the key rules:

```javascript
// Helper functions for role verification
function isAuthenticated() {
  return request.auth != null;
}

function isAdmin() {
  return isAuthenticated() && 
    exists(/databases/$(database)/documents/admins/$(request.auth.uid)) &&
    get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.isAdmin == true;
}

function isDriver() {
  return isAuthenticated() && 
    exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isDriver == true;
}

function isSender() {
  return isAuthenticated() && 
    exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
    (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isDriver == false || 
     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isDriver == null);
}
```

## Implementation Steps

1. **Update Driver Dashboard Authentication**:
   - Modify the role verification in `driver-dashboard.html` to handle cases where the `isDriver` flag might not be set:

```javascript
// Around line 393 in driver-dashboard.html
if (userDocSnap.exists()) {
    // Check if isDriver is explicitly set to true, or handle legacy accounts
    if (userDocSnap.data().isDriver === true) {
        userNameDisplay.textContent = userDocSnap.data().name || "Driver";
        setupRealtimeBookingsListeners();
    } else {
        // Update the user document to set the isDriver flag
        try {
            await updateDoc(userDocRef, {
                isDriver: true
            });
            userNameDisplay.textContent = userDocSnap.data().name || "Driver";
            setupRealtimeBookingsListeners();
            console.log("Updated user document with isDriver flag");
        } catch (updateError) {
            console.error("Error updating user document:", updateError);
            alert("Access Denied: You are not authorized to view this page.");
            await signOut(auth);
            window.location.href = 'login.html';
        }
    }
} else {
    alert("User profile not found. Please complete registration.");
    await signOut(auth);
    window.location.href = 'login.html';
}
```

2. **Update Sender Dashboard Authentication**:
   - Add the role verification code to `sender-active-deliveries.html` as shown above.

3. **Fix User Registration Process**:
   - Ensure that all new user accounts have the appropriate role flags set.

4. **Update Login Logic**:
   - Modify the login process to correctly redirect users based on their roles.

5. **Update Firebase Security Rules**:
   - Apply the updated security rules from `firebase-security-rules-fix.md`.

## Testing the Fix

After implementing these changes, test the application with different user roles:

1. **Create Test Users**:
   - Create a test driver user with `isDriver: true`
   - Create a test sender user with `isDriver: false`
   - Create a test admin user in the admins collection

2. **Test Login and Redirection**:
   - Verify that each user type is redirected to the appropriate dashboard

3. **Test Data Access**:
   - Verify that drivers can see available bookings and their assigned deliveries
   - Verify that senders can see their own bookings
   - Verify that admins can see all bookings and user data

## Additional Recommendations

1. **Add Role Management in Admin Dashboard**:
   - Create a user management section in the admin dashboard to allow admins to change user roles

2. **Implement User Profile Completion**:
   - Add a profile completion page for new users to select their role and provide necessary information

3. **Add Better Error Handling**:
   - Improve error messages to provide more context when authentication or permission issues occur

4. **Consider Using Firebase Auth Custom Claims**:
   - For a more robust solution, consider using Firebase Auth custom claims to store user roles instead of Firestore documents

By implementing these changes, you should resolve the authentication issues for driver and sender users while maintaining the working admin authentication.
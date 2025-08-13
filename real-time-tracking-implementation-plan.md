# Real-Time Delivery Tracking Implementation Plan

## Overview

This document outlines a comprehensive plan for implementing real-time delivery tracking in the FikaConnect application. The system will allow customers to track their deliveries in real-time, while drivers can share their location data securely. This feature will significantly enhance the user experience by providing transparency and reducing uncertainty about delivery status.

## Current System Analysis

The FikaConnect application already has:
1. A basic location tracking system in the driver dashboard (currently not fully implemented)
2. Firebase Firestore for data storage
3. User authentication for different roles (admin, driver, sender)
4. A booking system with status updates

However, the current system lacks:
1. Continuous real-time location updates from drivers
2. A customer-facing tracking interface
3. Proper integration between driver location data and delivery status
4. Efficient geospatial queries for nearby drivers

## Goals and Requirements

### Primary Goals
1. Enable drivers to share their real-time location securely
2. Allow customers to track their deliveries on a live map
3. Provide accurate estimated time of arrival (ETA)
4. Ensure the system is battery-efficient for drivers
5. Maintain data privacy and security

### Functional Requirements
1. **Driver Location Tracking**:
   - Collect location data from drivers at appropriate intervals
   - Store location data securely in Firestore
   - Allow drivers to start/stop location sharing

2. **Customer Tracking Interface**:
   - Display delivery status and driver location on a map
   - Show estimated time of arrival
   - Provide delivery status updates in real-time
   - Allow tracking via a shareable link (no login required)

3. **Admin Monitoring**:
   - View all active deliveries on a map
   - Filter deliveries by status, driver, or area
   - Access historical tracking data

4. **Notifications**:
   - Send push notifications for delivery status changes
   - Alert customers when driver is nearby

### Non-Functional Requirements
1. **Performance**:
   - Location updates should be processed within 3 seconds
   - Map should load within 5 seconds on average connections
   - System should handle at least 1000 concurrent tracking sessions

2. **Battery Efficiency**:
   - Driver app should optimize location tracking to minimize battery drain
   - Use adaptive polling intervals based on movement and delivery status

3. **Data Usage**:
   - Minimize data usage for drivers by optimizing location update frequency
   - Compress location data when possible

4. **Privacy & Security**:
   - Only share driver location data for assigned deliveries
   - Automatically stop location sharing when delivery is completed
   - Comply with data protection regulations

## Architecture Design

### High-Level Components

```mermaid
graph TD
    A[Driver App] -->|Location Updates| B[Firebase Firestore]
    B -->|Real-time Data| C[Customer Tracking Interface]
    B -->|Real-time Data| D[Admin Dashboard]
    E[Geolocation Service] -->|Distance & ETA| B
    F[Notification Service] -->|Status Updates| G[Customer Device]
    B -->|Delivery Status| F
```

### Component Details

#### 1. Driver Location Service
- **Purpose**: Collect and transmit driver location data
- **Implementation**:
  - Use HTML5 Geolocation API with watchPosition
  - Implement adaptive polling based on movement and battery level
  - Store location data in Firestore with timestamp and accuracy

#### 2. Geospatial Database Structure
- **Purpose**: Efficiently store and query location data
- **Implementation**:
  - Use Firestore for real-time updates
  - Create a dedicated `driverLocations` collection
  - Implement GeoHash for efficient spatial queries

#### 3. Customer Tracking Interface
- **Purpose**: Display delivery progress to customers
- **Implementation**:
  - Interactive map using Leaflet.js
  - Real-time updates using Firestore listeners
  - Responsive design for mobile and desktop

#### 4. ETA Calculation Service
- **Purpose**: Provide accurate delivery time estimates
- **Implementation**:
  - Distance matrix calculations
  - Traffic-aware routing using third-party API
  - Historical data analysis for better predictions

#### 5. Notification System
- **Purpose**: Keep customers informed of delivery status
- **Implementation**:
  - Firebase Cloud Messaging for push notifications
  - Email notifications for major status changes
  - SMS notifications for imminent delivery (optional)

## Database Schema

### Driver Locations Collection
```javascript
{
  "driverId": "string",
  "bookingId": "string",
  "timestamp": "timestamp",
  "location": {
    "lat": "number",
    "lng": "number",
    "accuracy": "number",
    "heading": "number",
    "speed": "number"
  },
  "status": "string", // "active", "inactive", "on_delivery"
  "batteryLevel": "number", // 0-100
  "geohash": "string" // For geospatial queries
}
```

### Bookings Collection (Updated)
```javascript
{
  // Existing fields...
  "tracking": {
    "enabled": "boolean",
    "startTime": "timestamp",
    "lastUpdateTime": "timestamp",
    "estimatedArrival": "timestamp",
    "distance": {
      "total": "number", // in kilometers
      "remaining": "number" // in kilometers
    },
    "shareableLink": "string" // Unique tracking link
  }
}
```

### Tracking Sessions Collection
```javascript
{
  "sessionId": "string",
  "bookingId": "string",
  "createdAt": "timestamp",
  "expiresAt": "timestamp",
  "lastAccessedAt": "timestamp",
  "accessCount": "number",
  "ipAddress": "string" // For security monitoring
}
```

## Implementation Plan

### Phase 1: Driver Location Tracking (2 weeks)

1. **Update Driver App (1 week)**
   - Enhance existing location tracking in driver-dashboard.html
   - Implement adaptive polling intervals
   - Add battery level monitoring
   - Create UI controls for starting/stopping tracking

2. **Set Up Firestore Structure (3 days)**
   - Create driverLocations collection
   - Implement security rules for location data
   - Set up data retention policies

3. **Implement Location Processing (4 days)**
   - Create Cloud Functions for processing location updates
   - Implement GeoHash calculation
   - Set up data validation and sanitization

### Phase 2: Customer Tracking Interface (2 weeks)

1. **Create Tracking Page (1 week)**
   - Develop tracking.html page with Leaflet map
   - Implement real-time updates with Firestore listeners
   - Design responsive UI for mobile and desktop

2. **Implement Shareable Tracking Links (3 days)**
   - Generate unique tracking IDs
   - Create secure access mechanism
   - Implement expiration for tracking links

3. **Develop ETA Calculation (4 days)**
   - Integrate with distance matrix API
   - Implement ETA algorithm
   - Display progress and ETA on tracking page

### Phase 3: Admin Monitoring and Integration (1 week)

1. **Enhance Admin Dashboard (3 days)**
   - Add map view of all active deliveries
   - Implement filtering and search
   - Create historical tracking data view

2. **Integrate with Existing Systems (2 days)**
   - Connect tracking with booking system
   - Update status change workflows
   - Implement automatic tracking start/stop based on delivery status

3. **Testing and Optimization (2 days)**
   - Performance testing
   - Battery usage optimization
   - Security review

### Phase 4: Notifications and Final Touches (1 week)

1. **Implement Notification System (3 days)**
   - Set up Firebase Cloud Messaging
   - Create notification templates
   - Implement delivery status notifications

2. **Final Integration and Testing (4 days)**
   - End-to-end testing
   - User acceptance testing
   - Performance optimization

## Technical Implementation Details

### 1. Driver Location Tracking

Update the existing location tracking in `driver-dashboard.html` with the following improvements:

```javascript
// Enhanced location tracking with adaptive intervals
let locationUpdateInterval = 10000; // Start with 10 seconds
let minInterval = 5000; // Minimum 5 seconds
let maxInterval = 60000; // Maximum 1 minute
let lastLocation = null;
let significantMovementThreshold = 10; // meters

function startLocationTracking() {
    if (locationWatcherId !== null) {
        showLocationMessage("Tracking is already active.", 'info');
        return;
    }

    if (!navigator.geolocation) {
        showLocationMessage("Geolocation is not supported by your browser.", 'error');
        return;
    }

    // Get battery level if available
    let batteryLevel = 100;
    if (navigator.getBattery) {
        navigator.getBattery().then(function(battery) {
            batteryLevel = battery.level * 100;
            
            // Adjust interval based on battery level
            if (batteryLevel < 20) {
                locationUpdateInterval = 30000; // 30 seconds when battery is low
            }
        });
    }

    showLocationMessage("Requesting location permission...", 'info');

    // Options for high accuracy when starting
    const options = {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000
    };

    locationWatcherId = navigator.geolocation.watchPosition(
        (position) => {
            const currentLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy,
                heading: position.coords.heading || 0,
                speed: position.coords.speed || 0
            };

            // Determine if this is a significant movement
            let isSignificantMovement = true;
            if (lastLocation) {
                const distance = calculateDistance(
                    lastLocation.lat, lastLocation.lng,
                    currentLocation.lat, currentLocation.lng
                );
                isSignificantMovement = distance > significantMovementThreshold;
            }

            // Only update if significant movement or first location
            if (isSignificantMovement || !lastLocation) {
                updateDriverLocationInFirestore(position, batteryLevel);
                lastLocation = currentLocation;
                
                // Adjust interval based on movement
                if (currentLocation.speed > 10) { // Moving fast
                    locationUpdateInterval = minInterval;
                } else if (currentLocation.speed > 5) { // Moving moderate
                    locationUpdateInterval = 15000; // 15 seconds
                } else { // Moving slow or stationary
                    locationUpdateInterval = maxInterval;
                }
                
                // Update UI
                locationStatusSpan.textContent = "ON";
                locationStatusSpan.className = 'tracking-on';
                startTrackingBtn.disabled = true;
                stopTrackingBtn.disabled = false;
            }
        },
        handleLocationError,
        options
    );

    console.log("Started location tracking. Watcher ID:", locationWatcherId);
    showLocationMessage("Location tracking started. Please ensure location services are enabled.", 'success');
}

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
}

// Enhanced function to update driver location in Firestore
async function updateDriverLocationInFirestore(position, batteryLevel = 100) {
    if (!CURRENT_DRIVER_ID) {
        console.warn("No driver ID available to update location.");
        return;
    }

    // Get assigned bookings to update their tracking info
    const assignedBookingsQuery = firestoreQuery(
        collection(db, "bookings"),
        where("assignedDriver", "==", CURRENT_DRIVER_ID),
        where("status", "in", ["Assigned", "Picked Up", "In Transit"])
    );
    
    const assignedBookingsSnapshot = await getDocs(assignedBookingsQuery);
    const hasAssignedBookings = !assignedBookingsSnapshot.empty;
    
    // Current location data
    const { latitude, longitude, accuracy, heading, speed } = position.coords;
    const timestamp = serverTimestamp();
    
    // Calculate GeoHash for efficient geospatial queries
    const geohash = calculateGeoHash(latitude, longitude);
    
    try {
        // Update driver's location in users collection
        const driverDocRef = doc(db, "users", CURRENT_DRIVER_ID);
        await updateDoc(driverDocRef, {
            lastKnownLocation: {
                lat: latitude,
                lng: longitude,
                accuracy: accuracy,
                heading: heading || 0,
                speed: speed || 0,
                timestamp: timestamp,
                batteryLevel: batteryLevel
            },
            isLocationSharingActive: true,
            lastLocationUpdate: timestamp
        });
        
        // Add entry to driverLocations collection for historical tracking
        await addDoc(collection(db, "driverLocations"), {
            driverId: CURRENT_DRIVER_ID,
            timestamp: timestamp,
            location: {
                lat: latitude,
                lng: longitude,
                accuracy: accuracy,
                heading: heading || 0,
                speed: speed || 0
            },
            batteryLevel: batteryLevel,
            status: hasAssignedBookings ? "on_delivery" : "active",
            geohash: geohash
        });
        
        // Update all assigned bookings with current location
        if (hasAssignedBookings) {
            assignedBookingsSnapshot.forEach(async (bookingDoc) => {
                const bookingId = bookingDoc.id;
                const bookingData = bookingDoc.data();
                
                // Calculate remaining distance and ETA if we have destination coordinates
                let remainingDistance = null;
                let estimatedArrival = null;
                
                if (bookingData.dropoffLocation && 
                    bookingData.dropoffLocation.lat && 
                    bookingData.dropoffLocation.lng) {
                    
                    remainingDistance = calculateDistance(
                        latitude, longitude,
                        bookingData.dropoffLocation.lat,
                        bookingData.dropoffLocation.lng
                    ) / 1000; // Convert to kilometers
                    
                    // Simple ETA calculation (can be improved with traffic data)
                    const avgSpeedKmh = speed ? (speed * 3.6) : 30; // Convert m/s to km/h or use average
                    const estimatedTimeHours = remainingDistance / Math.max(avgSpeedKmh, 10);
                    const estimatedArrivalDate = new Date();
                    estimatedArrivalDate.setHours(
                        estimatedArrivalDate.getHours() + estimatedTimeHours
                    );
                    estimatedArrival = Timestamp.fromDate(estimatedArrivalDate);
                }
                
                // Update booking with tracking information
                const bookingRef = doc(db, "bookings", bookingId);
                await updateDoc(bookingRef, {
                    "tracking.enabled": true,
                    "tracking.lastUpdateTime": timestamp,
                    "tracking.currentLocation": {
                        lat: latitude,
                        lng: longitude
                    },
                    "tracking.driverBatteryLevel": batteryLevel,
                    ...(remainingDistance !== null ? {"tracking.distance.remaining": remainingDistance} : {}),
                    ...(estimatedArrival !== null ? {"tracking.estimatedArrival": estimatedArrival} : {})
                });
            });
        }
        
        console.log(`Location updated: ${latitude}, ${longitude}`);
    } catch (error) {
        console.error("Error updating driver location in Firestore:", error);
        showLocationMessage("Failed to update location in database. Check permissions.", 'error');
    }
}

// Simple GeoHash implementation (can be replaced with a library)
function calculateGeoHash(latitude, longitude, precision = 8) {
    // This is a simplified version - in production use a proper geohash library
    // like 'latlon-geohash' or 'ngeohash'
    
    // For now, we'll return a string representation that can be used for basic sorting
    // Format: "lat,lng" with fixed precision
    return `${latitude.toFixed(precision)},${longitude.toFixed(precision)}`;
}
```

### 2. Customer Tracking Interface

Create a new `tracking.html` file for the customer tracking interface:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Track Your Delivery | FikaConnect</title>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
    <link rel="stylesheet" href="styles.css">
    <style>
        /* Tracking page specific styles */
        .tracking-container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .tracking-header {
            text-align: center;
            margin-bottom: 30px;
        }
        
        .tracking-header h1 {
            color: var(--primary-color);
            font-size: 2.2em;
            margin-bottom: 10px;
        }
        
        .tracking-header p {
            color: #666;
            font-size: 1.1em;
        }
        
        .tracking-info {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .tracking-map-container {
            flex: 1;
            min-width: 300px;
        }
        
        #trackingMap {
            height: 400px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        }
        
        .tracking-details {
            flex: 1;
            min-width: 300px;
            background-color: #fff;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        }
        
        .tracking-details h2 {
            color: var(--primary-color);
            font-size: 1.5em;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid #eee;
        }
        
        .detail-item {
            margin-bottom: 15px;
        }
        
        .detail-item .label {
            font-weight: 600;
            color: #555;
            margin-bottom: 5px;
        }
        
        .detail-item .value {
            color: #333;
            font-size: 1.1em;
        }
        
        .eta-display {
            background-color: #f8f9fa;
            border-radius: 8px;
            padding: 15px;
            margin-top: 20px;
            text-align: center;
        }
        
        .eta-display .eta-label {
            font-size: 0.9em;
            color: #666;
            margin-bottom: 5px;
        }
        
        .eta-display .eta-time {
            font-size: 1.8em;
            font-weight: 700;
            color: var(--primary-color);
        }
        
        .tracking-status {
            margin-top: 30px;
        }
        
        .status-timeline {
            position: relative;
            padding-left: 30px;
        }
        
        .status-timeline::before {
            content: '';
            position: absolute;
            left: 10px;
            top: 0;
            bottom: 0;
            width: 2px;
            background-color: #ddd;
        }
        
        .timeline-item {
            position: relative;
            margin-bottom: 20px;
            padding-bottom: 20px;
        }
        
        .timeline-item::before {
            content: '';
            position: absolute;
            left: -30px;
            top: 0;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background-color: #ddd;
            border: 3px solid #fff;
            box-shadow: 0 0 0 1px #ddd;
        }
        
        .timeline-item.active::before {
            background-color: var(--primary-color);
        }
        
        .timeline-item.completed::before {
            background-color: var(--accent-color);
        }
        
        .timeline-item .time {
            font-size: 0.85em;
            color: #888;
            margin-bottom: 5px;
        }
        
        .timeline-item .status {
            font-weight: 600;
            color: #333;
            font-size: 1.1em;
        }
        
        .timeline-item .description {
            color: #666;
            margin-top: 5px;
        }
        
        .loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(255, 255, 255, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }
        
        .loading-spinner {
            color: var(--primary-color);
            font-size: 2em;
        }
        
        .error-message {
            text-align: center;
            padding: 30px;
            background-color: #f8d7da;
            color: #721c24;
            border-radius: 10px;
            margin: 30px auto;
            max-width: 600px;
        }
    </style>
</head>
<body>
    <header class="page-header">
        <div class="container">
            <h1><a href="landing.html">FikaConnect</a></h1>
            <nav class="main-nav">
                <a href="login.html">Login</a>
                <a href="signup.html">Register</a>
                <a href="about.html">About Us</a>
            </nav>
        </div>
    </header>

    <main class="tracking-container">
        <div id="loadingOverlay" class="loading-overlay">
            <div class="loading-spinner">
                <i class="fas fa-spinner fa-spin"></i> Loading tracking information...
            </div>
        </div>
        
        <div id="errorMessage" class="error-message" style="display: none;">
            Tracking information not found or has expired.
        </div>
        
        <div id="trackingContent" style="display: none;">
            <div class="tracking-header">
                <h1>Track Your Delivery</h1>
                <p>Booking ID: <span id="bookingIdDisplay">Loading...</span></p>
            </div>
            
            <div class="tracking-info">
                <div class="tracking-map-container">
                    <div id="trackingMap"></div>
                </div>
                
                <div class="tracking-details">
                    <h2>Delivery Details</h2>
                    
                    <div class="detail-item">
                        <div class="label">From</div>
                        <div class="value" id="pickupLocation">Loading...</div>
                    </div>
                    
                    <div class="detail-item">
                        <div class="label">To</div>
                        <div class="value" id="dropoffLocation">Loading...</div>
                    </div>
                    
                    <div class="detail-item">
                        <div class="label">Status</div>
                        <div class="value" id="currentStatus">Loading...</div>
                    </div>
                    
                    <div class="detail-item">
                        <div class="label">Driver</div>
                        <div class="value" id="driverName">Loading...</div>
                    </div>
                    
                    <div class="eta-display">
                        <div class="eta-label">Estimated Time of Arrival</div>
                        <div class="eta-time" id="etaDisplay">Calculating...</div>
                    </div>
                </div>
            </div>
            
            <div class="tracking-status">
                <h2>Delivery Progress</h2>
                <div class="status-timeline" id="statusTimeline">
                    <!-- Status timeline items will be added here dynamically -->
                </div>
            </div>
        </div>
    </main>
    
    <footer class="page-footer">
        <div class="container">
            <p>&copy; 2025 FikaConnect — Smart Logistics for East Africa</p>
        </div>
    </footer>

    <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
    <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
        import { getFirestore, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
        
        // Firebase configuration
        const firebaseConfig = {
            apiKey: "AIzaSyDq3uO76nnqqPgPaFfXpOTEnFSXRqXneWU",
            authDomain: "fika-connect-5f844.firebaseapp.com",
            projectId: "fika-connect-5f844",
            storageBucket: "fika-connect-5f844.appspot.com",
            messagingSenderId: "124223307329",
            appId: "1:124223307329:web
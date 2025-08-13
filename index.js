/**
 * FikaConnect Server-Side Price Validation and Booking Finalization
 *
 * This Cloud Function is triggered whenever a new document is created in the
 * 'bookings' collection. It re-calculates the fare and validates the
 * submitted data to prevent client-side manipulation.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

// Define constants for pricing and commission rates
// IMPORTANT: These must match the constants in your front-end code.
const DIRECT_DELIVERY_BASE_FARE = 3000;
const COLLECTION_POINT_BASE_FARE = 2000;
const PER_KM_RATE = 800;
const PER_KG_RATE = 500;
const FRAGILE_FEE = 1500;
const MINIMUM_FARE = 5000;
const COLLECTION_POINT_DISCOUNT = 0.9; // 10% discount
const COMMISSION_RATE = 0.15; // 15% commission

const SIZE_MULTIPLIERS = {
    'small': 1.0,
    'medium': 1.2,
    'large': 1.5,
    'xlarge': 2.0,
};

// Hardcoded Collection Points (replace with Firestore fetch in a real app)
const collectionPoints = [
    { id: 'cp1', name: 'Kampala Central - Main Office', lat: 0.3150, lng: 32.5822 },
    { id: 'cp2', name: 'Entebbe Road - Kitooro', lat: 0.0536, lng: 32.4632 },
    { id: 'cp3', name: 'Jinja Road - Mukono', lat: 0.3556, lng: 32.7570 },
    { id: 'cp4', name: 'Gulu Highway - Luwero', lat: 0.8333, lng: 32.4833 }
];

/**
 * Calculates the distance between two points on Earth using the Haversine formula.
 * @param {Object} start - An object with lat and lng properties for the starting point.
 * @param {Object} end - An object with lat and lng properties for the ending point.
 * @returns {number} The distance in kilometers.
 */
function getDistance(start, end) {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (end.lat - start.lat) * Math.PI / 180;
    const dLng = (end.lng - start.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(start.lat * Math.PI / 180) * Math.cos(end.lat * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

/**
 * Calculates the final fare, commission, and driver payout for a direct delivery.
 * @param {number} distance - The distance in kilometers.
 * @param {number} weight - The package weight in kilograms.
 * @param {string} sizeCategory - The package size ('small', 'medium', etc.).
 * @param {boolean} isFragile - True if the package is fragile.
 * @returns {Object} An object containing totalFare, commission, and driverPayout.
 */
function calculateDirectDeliveryFare(distance, weight, sizeCategory, isFragile) {
    const sizeMultiplier = SIZE_MULTIPLIERS[sizeCategory] || 1.0;
    const fragileFee = isFragile ? FRAGILE_FEE : 0;

    let totalFare = DIRECT_DELIVERY_BASE_FARE +
        (distance * PER_KM_RATE) +
        ((weight * PER_KG_RATE) * sizeMultiplier) +
        fragileFee;

    // Apply minimum fare rule
    totalFare = Math.max(totalFare, MINIMUM_FARE);

    const commission = totalFare * COMMISSION_RATE;
    const driverPayout = totalFare - commission;

    return { totalFare, commission, driverPayout };
}

/**
 * Calculates the final fare, commission, and driver payout for a collection point delivery.
 * @param {number} distance - The distance in kilometers.
 * @param {number} weight - The package weight in kilograms.
 * @param {string} sizeCategory - The package size ('small', 'medium', etc.).
 * @param {boolean} isFragile - True if the package is fragile.
 * @returns {Object} An object containing totalFare, commission, and driverPayout.
 */
function calculateCollectionPointFare(distance, weight, sizeCategory, isFragile) {
    const sizeMultiplier = SIZE_MULTIPLIERS[sizeCategory] || 1.0;
    const fragileFee = isFragile ? FRAGILE_FEE : 0;

    let baseCalculation = COLLECTION_POINT_BASE_FARE +
        (distance * PER_KM_RATE) +
        ((weight * PER_KG_RATE) * sizeMultiplier) +
        fragileFee;

    let totalFare = baseCalculation * COLLECTION_POINT_DISCOUNT;

    // Round to the nearest 100 UGX
    totalFare = Math.round(totalFare / 100) * 100;

    const commission = totalFare * COMMISSION_RATE;
    const driverPayout = totalFare - commission;

    return { totalFare, commission, driverPayout };
}


exports.validateAndFinalizeBooking = functions.firestore
    .document('bookings/{bookingId}')
    .onCreate(async (snap, context) => {
        const bookingData = snap.data();
        const bookingId = context.params.bookingId;

        functions.logger.info("Processing new booking:", bookingId);
        
        // Extract relevant data for calculation
        const deliveryType = bookingData.deliveryType;
        const weight = bookingData.packageDetails.weight;
        const sizeCategory = bookingData.packageDetails.size;
        const isFragile = bookingData.packageDetails.isFragile;
        
        let calculatedFareDetails = null;
        let distance = 0;

        if (deliveryType === 'direct') {
            const pickup = bookingData.pickup;
            const dropoff = bookingData.dropoff;
            if (!pickup || !dropoff || !pickup.lat || !dropoff.lat) {
                functions.logger.error("Invalid location data for direct delivery.");
                return;
            }
            distance = getDistance(pickup, dropoff);
            calculatedFareDetails = calculateDirectDeliveryFare(distance, weight, sizeCategory, isFragile);
        } else if (deliveryType === 'collection_point') {
            const pickupPointId = bookingData.pickup.lat;
            const dropoffPointId = bookingData.dropoff.lat;
            const startPoint = collectionPoints.find(p => p.lat === pickupPointId);
            const endPoint = collectionPoints.find(p => p.lat === dropoffPointId);

            if (!startPoint || !endPoint) {
                functions.logger.error("Invalid collection point data.");
                return;
            }
            const start = { lat: startPoint.lat, lng: startPoint.lng };
            const end = { lat: endPoint.lat, lng: endPoint.lng };
            distance = getDistance(start, end);
            calculatedFareDetails = calculateCollectionPointFare(distance, weight, sizeCategory, isFragile);
        } else {
            functions.logger.error("Invalid delivery type:", deliveryType);
            return;
        }

        if (calculatedFareDetails) {
            // Compare the calculated fare with the user-submitted fare
            const userSubmittedFare = bookingData.paymentDetails.estimatedFare;
            const fareDifference = Math.abs(calculatedFareDetails.totalFare - userSubmittedFare);
            
            // Allow for a small tolerance in case of floating-point arithmetic differences
            if (fareDifference > 1) { 
                functions.logger.warn(`Fare mismatch. Calculated: ${calculatedFareDetails.totalFare}, Submitted: ${userSubmittedFare}.`);
            }

            // Update the document with the final, server-side calculated values
            // This overwrites any potentially manipulated data from the client
            await snap.ref.update({
                'paymentDetails.estimatedFare': calculatedFareDetails.totalFare,
                'paymentDetails.commission': calculatedFareDetails.commission,
                'paymentDetails.driverPayout': calculatedFareDetails.driverPayout,
                'distance': distance, // Also save the server-calculated distance
                'lastUpdated': admin.firestore.FieldValue.serverTimestamp()
            });

            functions.logger.info("Booking successfully validated and finalized:", bookingId);
        } else {
            functions.logger.error("Failed to calculate fare for booking:", bookingId);
        }
    });
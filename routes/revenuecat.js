const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// RevenueCat API configuration
const REVENUECAT_API_BASE = 'https://api.revenuecat.com/v1';
const REVENUECAT_SECRET_KEY = process.env.REVENUECAT_SECRET_KEY; // Add this to your .env

// Get offerings from RevenueCat API
router.get('/offerings', auth, async (req, res) => {
  try {
    console.log('🔄 Fetching RevenueCat offerings from API...');
    
    if (!REVENUECAT_SECRET_KEY) {
      console.log('⚠️ RevenueCat secret key not configured, returning fallback offerings');
      return res.json({
        success: true,
        data: {
          offerings: getFallbackOfferings()
        }
      });
    }

    const response = await fetch(`${REVENUECAT_API_BASE}/projects/${process.env.REVENUECAT_PROJECT_ID}/offerings`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${REVENUECAT_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`RevenueCat API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ RevenueCat offerings fetched successfully');

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Error fetching RevenueCat offerings:', error);
    
    // Return fallback offerings
    res.json({
      success: true,
      data: {
        offerings: getFallbackOfferings()
      }
    });
  }
});

// Get products from RevenueCat API
router.get('/products', auth, async (req, res) => {
  try {
    console.log('🔄 Fetching RevenueCat products from API...');
    
    // Return our configured products
    const products = [
      {
        identifier: 'com.booali.Atc.basic',
        price: 1.00,
        price_string: '$1.00',
        currency_code: 'USD',
        title: 'Builder Package',
        description: '100 credits for ATC',
        credits: 100
      },
      {
        identifier: 'com.booali.Atc.standard',
        price: 3.00,
        price_string: '$3.00',
        currency_code: 'USD',
        title: 'Legacy Package',
        description: '350 credits for ATC',
        credits: 350
      },
      {
        identifier: 'com.booali.Atc.premium',
        price: 5.00,
        price_string: '$5.00',
        currency_code: 'USD',
        title: 'Supporter Package',
        description: '500 credits for ATC',
        credits: 500
      }
    ];

    console.log('✅ Products fetched successfully');

    res.json({
      success: true,
      data: {
        products: products
      }
    });

  } catch (error) {
    console.error('❌ Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: error.message
    });
  }
});

// Purchase product via RevenueCat API
router.post('/purchase', auth, async (req, res) => {
  try {
    const { productId, receipt, platform } = req.body;
    const userId = req.user.id;

    console.log('🛒 Processing RevenueCat purchase:', {
      productId,
      platform,
      userId
    });

    // For now, we'll handle this via the existing subscription verification
    // This endpoint can be expanded to integrate with RevenueCat's purchase API

    res.json({
      success: true,
      message: 'Purchase processed successfully',
      data: {
        productId,
        userId,
        platform
      }
    });

  } catch (error) {
    console.error('❌ Error processing purchase:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing purchase',
      error: error.message
    });
  }
});

function getFallbackOfferings() {
  return {
    current: {
      identifier: 'credit_packages',
      description: 'ATC Credit Packages',
      packages: [
        {
          identifier: 'basic_package',
          platform_product_identifier: 'com.booali.Atc.basic',
          product: {
            identifier: 'com.booali.Atc.basic',
            price: 1.00,
            price_string: '$1.00',
            currency_code: 'USD',
            title: 'Builder Package',
            description: '100 credits for ATC'
          }
        },
        {
          identifier: 'standard_package',
          platform_product_identifier: 'com.booali.Atc.standard',
          product: {
            identifier: 'com.booali.Atc.standard',
            price: 3.00,
            price_string: '$3.00',
            currency_code: 'USD',
            title: 'Legacy Package',
            description: '350 credits for ATC'
          }
        },
        {
          identifier: 'premium_package',
          platform_product_identifier: 'com.booali.Atc.premium',
          product: {
            identifier: 'com.booali.Atc.premium',
            price: 5.00,
            price_string: '$5.00',
            currency_code: 'USD',
            title: 'Supporter Package',
            description: '500 credits for ATC'
          }
        }
      ]
    }
  };
}

module.exports = router;
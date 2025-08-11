const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const Payment = require('../models/Payment');

const router = express.Router();

// Stripe configuration
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Product price IDs configuration
const PRICE_IDS = {
  'one-time': process.env.STRIPE_ONE_TIME_PRICE_ID,
  'basic': process.env.STRIPE_BASIC_PRICE_ID,
  'pro': process.env.STRIPE_PRO_PRICE_ID
};

// Create checkout session
router.post('/create-checkout', auth, async (req, res) => {
  try {
    const { plan, billingCycle = 'monthly' } = req.body;
    
    if (!PRICE_IDS[plan]) {
      return res.status(400).json({ error: 'Invalid plan selected' });
    }

    const user = req.user;
    const priceId = PRICE_IDS[plan];

    // Create or get Stripe customer
    let customerId = user.customerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        metadata: {
          userId: user._id.toString()
        }
      });
      customerId = customer.id;
      
      // Update user with customer ID
      user.customerId = customerId;
      await user.save();
    }

    // Create checkout session
    const sessionConfig = {
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      success_url: `${process.env.FRONTEND_URL}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing?payment=cancelled`,
      metadata: {
        userId: user._id.toString(),
        plan: plan
      }
    };

    // For subscriptions, set mode to subscription
    if (plan !== 'one-time') {
      sessionConfig.mode = 'subscription';
      sessionConfig.subscription_data = {
        metadata: {
          userId: user._id.toString(),
          plan: plan
        }
      };
    } else {
      sessionConfig.mode = 'payment';
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    
    res.json({
      checkoutUrl: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error('Create checkout error:', error.message);
    res.status(500).json({ 
      error: 'Failed to create checkout session',
      details: error.message
    });
  }
});

// Get user's payment history
router.get('/history', auth, async (req, res) => {
  try {
    const payments = await Payment.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(20);
    
    res.json({ payments });
  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

// Cancel subscription
router.post('/cancel-subscription', auth, async (req, res) => {
  try {
    const user = req.user;
    
    if (!user.subscriptionId) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    // Cancel subscription with Lemon Squeezy
    await lemonSqueezyAPI.patch(`/subscriptions/${user.subscriptionId}`, {
      data: {
        type: 'subscriptions',
        id: user.subscriptionId,
        attributes: {
          cancelled: true
        }
      }
    });

    // Update user status
    user.planStatus = 'cancelled';
    await user.save();

    // Update payment record
    await Payment.findOneAndUpdate(
      { userId: user._id, lemonSqueezySubscriptionId: user.subscriptionId },
      { subscriptionStatus: 'cancelled' }
    );

    res.json({ message: 'Subscription cancelled successfully' });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// Lemon Squeezy webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-signature'];
    const payload = req.body;

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.error('Invalid webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(payload.toString());
    const eventType = event.meta.event_name;
    const eventData = event.data;

    console.log(`Received webhook: ${eventType}`);

    switch (eventType) {
      case 'order_created':
        await handleOrderCreated(eventData);
        break;
      
      case 'subscription_created':
        await handleSubscriptionCreated(eventData);
        break;
      
      case 'subscription_updated':
        await handleSubscriptionUpdated(eventData);
        break;
      
      case 'subscription_cancelled':
        await handleSubscriptionCancelled(eventData);
        break;
      
      case 'subscription_resumed':
        await handleSubscriptionResumed(eventData);
        break;
      
      case 'subscription_expired':
        await handleSubscriptionExpired(eventData);
        break;
      
      case 'subscription_payment_success':
        await handleSubscriptionPaymentSuccess(eventData);
        break;
      
      case 'subscription_payment_failed':
        await handleSubscriptionPaymentFailed(eventData);
        break;
      
      default:
        console.log(`Unhandled webhook event: ${eventType}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Webhook event handlers
async function handleOrderCreated(data) {
  try {
    const customerEmail = data.attributes.user_email;
    const orderId = data.id;
    const customerId = data.attributes.customer_id;
    const variantId = data.attributes.first_order_item.variant_id;
    const amount = data.attributes.total;
    
    // Find user by email
    const user = await User.findOne({ email: customerEmail });
    if (!user) {
      console.error(`User not found for email: ${customerEmail}`);
      return;
    }

    // Determine plan from variant ID
    const plan = getPlanFromVariantId(variantId);
    
    // Create payment record
    const payment = new Payment({
      userId: user._id,
      lemonSqueezyOrderId: orderId,
      lemonSqueezyCustomerId: customerId,
      productName: data.attributes.first_order_item.product_name,
      variantName: data.attributes.first_order_item.variant_name,
      amount: amount,
      paymentType: plan === 'one-time' ? 'one-time' : 'subscription',
      plan: plan,
      status: 'paid',
      webhookData: data
    });

    await payment.save();

    // Update user plan for one-time purchases
    if (plan === 'one-time') {
      user.plan = 'one-time';
      user.planStatus = 'active';
      user.customerId = customerId;
      user.usage.cvScans = 0; // Reset usage
      user.usage.linkedinScans = 0;
      await user.save();
    }

    console.log(`Order created for user ${user.email}: ${plan} plan`);
  } catch (error) {
    console.error('Handle order created error:', error);
  }
}

async function handleSubscriptionCreated(data) {
  try {
    const customerEmail = data.attributes.user_email;
    const subscriptionId = data.id;
    const customerId = data.attributes.customer_id;
    const variantId = data.attributes.variant_id;
    const status = data.attributes.status;
    
    const user = await User.findOne({ email: customerEmail });
    if (!user) {
      console.error(`User not found for email: ${customerEmail}`);
      return;
    }

    const plan = getPlanFromVariantId(variantId);
    
    // Update user subscription info
    user.plan = plan;
    user.planStatus = status === 'active' ? 'active' : 'pending';
    user.subscriptionId = subscriptionId;
    user.customerId = customerId;
    user.planExpiresAt = new Date(data.attributes.renews_at);
    user.usage.cvScans = 0; // Reset usage
    user.usage.linkedinScans = 0;
    await user.save();

    // Update payment record
    await Payment.findOneAndUpdate(
      { lemonSqueezyCustomerId: customerId },
      {
        lemonSqueezySubscriptionId: subscriptionId,
        subscriptionStatus: status,
        currentPeriodStart: new Date(data.attributes.created_at),
        currentPeriodEnd: new Date(data.attributes.renews_at)
      }
    );

    console.log(`Subscription created for user ${user.email}: ${plan} plan`);
  } catch (error) {
    console.error('Handle subscription created error:', error);
  }
}

async function handleSubscriptionUpdated(data) {
  try {
    const subscriptionId = data.id;
    const status = data.attributes.status;
    
    const user = await User.findOne({ subscriptionId });
    if (!user) {
      console.error(`User not found for subscription: ${subscriptionId}`);
      return;
    }

    user.planStatus = status;
    user.planExpiresAt = new Date(data.attributes.renews_at);
    await user.save();

    await Payment.findOneAndUpdate(
      { lemonSqueezySubscriptionId: subscriptionId },
      {
        subscriptionStatus: status,
        currentPeriodEnd: new Date(data.attributes.renews_at)
      }
    );

    console.log(`Subscription updated for user ${user.email}: status ${status}`);
  } catch (error) {
    console.error('Handle subscription updated error:', error);
  }
}

async function handleSubscriptionCancelled(data) {
  try {
    const subscriptionId = data.id;
    
    const user = await User.findOne({ subscriptionId });
    if (!user) return;

    user.planStatus = 'cancelled';
    await user.save();

    await Payment.findOneAndUpdate(
      { lemonSqueezySubscriptionId: subscriptionId },
      { subscriptionStatus: 'cancelled' }
    );

    console.log(`Subscription cancelled for user ${user.email}`);
  } catch (error) {
    console.error('Handle subscription cancelled error:', error);
  }
}

async function handleSubscriptionExpired(data) {
  try {
    const subscriptionId = data.id;
    
    const user = await User.findOne({ subscriptionId });
    if (!user) return;

    user.plan = 'free';
    user.planStatus = 'expired';
    await user.save();

    await Payment.findOneAndUpdate(
      { lemonSqueezySubscriptionId: subscriptionId },
      { subscriptionStatus: 'expired' }
    );

    console.log(`Subscription expired for user ${user.email}`);
  } catch (error) {
    console.error('Handle subscription expired error:', error);
  }
}

async function handleSubscriptionPaymentSuccess(data) {
  try {
    const subscriptionId = data.attributes.subscription_id;
    
    const user = await User.findOne({ subscriptionId });
    if (!user) return;

    // Reset monthly usage on successful payment
    user.usage.cvScans = 0;
    user.usage.linkedinScans = 0;
    user.usage.monthlyResetDate = new Date();
    await user.save();

    console.log(`Payment success for user ${user.email}`);
  } catch (error) {
    console.error('Handle payment success error:', error);
  }
}

async function handleSubscriptionPaymentFailed(data) {
  try {
    const subscriptionId = data.attributes.subscription_id;
    
    const user = await User.findOne({ subscriptionId });
    if (!user) return;

    user.planStatus = 'past_due';
    await user.save();

    console.log(`Payment failed for user ${user.email}`);
  } catch (error) {
    console.error('Handle payment failed error:', error);
  }
}

// Helper functions
function getPlanFromVariantId(variantId) {
  const variantMap = {
    [PRODUCT_VARIANTS['one-time']]: 'one-time',
    [PRODUCT_VARIANTS['basic']]: 'basic',
    [PRODUCT_VARIANTS['pro']]: 'pro'
  };
  return variantMap[variantId] || 'one-time';
}

function getProductDescription(plan) {
  const descriptions = {
    'one-time': '1 CV + LinkedIn optimization with PDF export',
    'basic': '5 scans per month with PDF export',
    'pro': 'Unlimited scans, AI suggestions, comparison view, and API access'
  };
  return descriptions[plan] || descriptions['one-time'];
}

module.exports = router;
